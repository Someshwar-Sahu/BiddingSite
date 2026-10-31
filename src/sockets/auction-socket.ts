import { Server as SocketIOServer, Socket } from 'socket.io';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import { verifyInviteToken, type InviteRecord } from '../magic-link.js';
import { evaluateAntiSniping, type AuctionTimerConfig } from '../auction-timer.js';
import { parseCookies, validateSession } from '../auth.js';

interface ActiveSeat {
  socketId: string;
  vendorId: string;
  claimedAt: Date;
  disconnectTimeout?: NodeJS.Timeout;
}

// In-memory state tracking:
// 1. Primary Bidding Seat: (auctionId:vendorId) -> ActiveSeat
const activeBiddingSeats = new Map<string, ActiveSeat>();

// 2. Presence tracking: auctionId -> (vendorId -> Set<socketId>)
const auctionVendorPresence = new Map<string, Map<string, Set<string>>>();

export function isVendorPresentInAuction(auctionId: string, vendorId: string): boolean {
  const vendorMap = auctionVendorPresence.get(auctionId);
  if (!vendorMap) return false;
  const sockets = vendorMap.get(vendorId);
  return Boolean(sockets && sockets.size > 0);
}

export function registerAuctionSockets(
  io: SocketIOServer,
  db: Database.Database,
  repo: AuctionRepository
): void {
  io.on('connection', (socket: Socket) => {
    // Strictly isolate notification subscriptions based on the declared realm of the socket
    const applyNotificationAuth = (requestedRealm?: string) => {
      try {
        const cookies = parseCookies(socket.handshake.headers.cookie);
        const realm =
          requestedRealm ||
          (socket.handshake.auth?.realm as string) ||
          (socket.handshake.query?.realm as string);

        // Always remove socket from all privileged rooms before re-authorizing
        socket.leave('role:admin');
        socket.leave('role:customer');

        if (realm === 'admin') {
          const adminSession = validateSession(db, cookies['nta_admin_session'], 'admin');
          if (adminSession) {
            socket.join('role:admin');
          }
        } else if (realm === 'customer') {
          const custSession = validateSession(db, cookies['nta_customer_session'], 'customer');
          if (custSession && custSession.organizationId) {
            socket.join(`org:${custSession.organizationId}`);
            socket.join('role:customer');
          }
        } else if (realm === 'vendor') {
          const vendorSession = validateSession(db, cookies['nta_vendor_session'], 'vendor');
          if (vendorSession && vendorSession.organizationId) {
            socket.join(`vendor:${vendorSession.organizationId}`);
          }
        }
      } catch (e) {}
    };

    // Apply authorization upon connection based on handshake auth
    applyNotificationAuth();

    // Client explicitly declares and authenticates realm
    socket.on('authenticate_notifications', (data: { realm: string }) => {
      applyNotificationAuth(data?.realm);
    });

    socket.on('disconnect_notifications', () => {
      socket.leave('role:admin');
      socket.leave('role:customer');
    });

    // 1. Join room and authenticate with Magic Link token or active session cookie
    socket.on('join_room', (data: { auctionId: string; token?: string }) => {
      try {
        const cookies = parseCookies(socket.handshake.headers.cookie);

        // A. Direct session authentication for Corporate Buyer or Operations Lead
        if (!data.token) {
          const custSession = validateSession(db, cookies['nta_customer_session'], 'customer');
          const adminSession = validateSession(db, cookies['nta_admin_session'], 'admin');
          const vendorSession = validateSession(db, cookies['nta_vendor_session'], 'vendor');

          if (custSession && custSession.organizationId) {
            const auc = db.prepare('SELECT a.*, o.name as org_name FROM auctions a JOIN organizations o ON a.customer_org_id = o.id WHERE a.id = ?').get(data.auctionId) as any;
            if (auc && auc.customer_org_id === custSession.organizationId) {
              socket.join(`auction:${data.auctionId}`);
              socket.data = {
                role: 'customer_observer',
                auctionId: data.auctionId,
                companyName: `${auc.org_name} (Observer)`,
              };
              const lots = repo.getLotsForAuction(data.auctionId);
              return socket.emit('room_joined', {
                role: 'customer_observer',
                companyName: `${auc.org_name} (Observer)`,
                lots,
                status: auc.status,
              });
            }
          } else if (adminSession) {
            socket.join(`auction:${data.auctionId}`);
            socket.data = {
              role: 'customer_observer',
              auctionId: data.auctionId,
              companyName: 'NTA Operations (Spectator)',
            };
            const auc = db.prepare('SELECT * FROM auctions WHERE id = ?').get(data.auctionId) as any;
            const lots = repo.getLotsForAuction(data.auctionId);
            return socket.emit('room_joined', {
              role: 'customer_observer',
              companyName: 'NTA Operations (Spectator)',
              lots,
              status: auc?.status || 'live',
            });
          } else if (vendorSession && vendorSession.organizationId) {
            // Supplier authenticated via persistent session cookie without token in query
            const invite = db.prepare('SELECT * FROM auction_invites WHERE auction_id = ? AND vendor_id = ? AND is_revoked = 0').get(data.auctionId, vendorSession.organizationId) as any;
            if (invite) {
              data.token = invite.token;
            }
          }

          if (!data.token) {
            return socket.emit('error_message', {
              code: 'INVALID_TOKEN',
              message: 'Authentication token or active buyer session required to view this auction room.',
            });
          }
        }

        // B. Token-based Supplier / Observer verification
        const invite = db
          .prepare(`
            SELECT i.*, v.company_name as vendorCompanyName, v.status as vendorStatus 
            FROM auction_invites i 
            LEFT JOIN vendors v ON i.vendor_id = v.id 
            WHERE i.token = ? AND i.auction_id = ?
          `)
          .get(data.token, data.auctionId) as any;

        if (!invite) {
          return socket.emit('error_message', {
            code: 'INVALID_TOKEN',
            message: 'Invalid or unrecognized access link for this auction.',
          });
        }

        const inviteRecord: InviteRecord = {
          token: invite.token,
          auctionId: invite.auction_id,
          role: invite.role,
          vendorId: invite.vendor_id || undefined,
          vendorCompanyName: invite.vendorCompanyName || undefined,
          vendorStatus: invite.vendorStatus || undefined,
          expiresAt: new Date(invite.expires_at),
          isRevoked: Boolean(invite.is_revoked),
        };

        const auth = verifyInviteToken(inviteRecord);
        if (!auth.isAuthorized) {
          return socket.emit('error_message', { code: auth.errorCode, message: auth.errorMessage });
        }

        let companyName = auth.companyName;
        if (invite.role === 'customer_observer') {
          const org = db
            .prepare(`
              SELECT o.name FROM auctions a 
              JOIN organizations o ON a.customer_org_id = o.id 
              WHERE a.id = ?
            `)
            .get(data.auctionId) as { name: string } | undefined;
          if (org?.name) {
            companyName = `${org.name} (Observer)`;
          }
        }

        // Join company-wide room for cross-auction alerts
        if (invite.vendor_id) {
          socket.join(`vendor:${invite.vendor_id}`);
        }

        // Presence & Single Active Bidding Seat Concurrency
        let isPrimaryBidder = false;
        const seatKey = `${data.auctionId}:${invite.vendor_id}`;

        if (auth.role === 'vendor' && invite.vendor_id) {
          // Track room presence
          if (!auctionVendorPresence.has(data.auctionId)) {
            auctionVendorPresence.set(data.auctionId, new Map());
          }
          const vMap = auctionVendorPresence.get(data.auctionId)!;
          if (!vMap.has(invite.vendor_id)) {
            vMap.set(invite.vendor_id, new Set());
          }
          vMap.get(invite.vendor_id)!.add(socket.id);

          // Evaluate Primary Bidder Seat
          const currentSeat = activeBiddingSeats.get(seatKey);
          if (!currentSeat) {
            // First member to join claims the seat
            activeBiddingSeats.set(seatKey, {
              socketId: socket.id,
              vendorId: invite.vendor_id,
              claimedAt: new Date(),
            });
            isPrimaryBidder = true;
          } else if (currentSeat.disconnectTimeout) {
            // Previous primary bidder disconnected within 60s grace period and has reconnected
            clearTimeout(currentSeat.disconnectTimeout);
            currentSeat.disconnectTimeout = undefined;
            currentSeat.socketId = socket.id;
            isPrimaryBidder = true;
          } else if (currentSeat.socketId === socket.id) {
            isPrimaryBidder = true;
          } else {
            // A colleague already holds the active bidding seat -> Join as Read-Only Mirror
            isPrimaryBidder = false;
          }
        }

        socket.data = {
          auctionId: data.auctionId,
          role: auth.role,
          vendorId: invite.vendor_id,
          companyName: companyName || 'Participant',
          isPrimaryBidder,
        };

        const roomName = `auction:${data.auctionId}`;
        socket.join(roomName);

        const auction = db
          .prepare('SELECT status, current_end FROM auctions WHERE id = ?')
          .get(data.auctionId) as { status: string; current_end: string } | undefined;

        const lots = repo.getLotsForAuction(data.auctionId);
        socket.emit('room_joined', {
          auctionId: data.auctionId,
          role: auth.role,
          vendorId: invite.vendor_id,
          companyName: socket.data.companyName,
          status: auction?.status || 'scheduled',
          lots,
          isPrimaryBidder,
          activeBidderSeatHeld: auth.role === 'vendor' ? !isPrimaryBidder : false,
        });
      } catch (err: any) {
        socket.emit('error_message', {
          code: 'SERVER_ERROR',
          message: err.message || 'An error occurred while joining the auction room.',
        });
      }
    });

    // Explicitly relinquish bidding controls to a waiting teammate
    socket.on('relinquish_bidding_seat', () => {
      const session = socket.data;
      if (!session || !session.auctionId || !session.vendorId) return;

      const seatKey = `${session.auctionId}:${session.vendorId}`;
      const seat = activeBiddingSeats.get(seatKey);

      if (seat && seat.socketId === socket.id) {
        activeBiddingSeats.delete(seatKey);
        session.isPrimaryBidder = false;
        socket.emit('seat_relinquished');
        io.to(`auction:${session.auctionId}`).emit('bidding_seat_available', {
          vendorId: session.vendorId,
          auctionId: session.auctionId,
        });
      }
    });

    // Mirror colleague claims an available bidding seat
    socket.on('claim_bidding_seat', () => {
      const session = socket.data;
      if (!session || !session.auctionId || !session.vendorId || session.role !== 'vendor') return;

      const seatKey = `${session.auctionId}:${session.vendorId}`;
      const seat = activeBiddingSeats.get(seatKey);

      if (!seat) {
        activeBiddingSeats.set(seatKey, {
          socketId: socket.id,
          vendorId: session.vendorId,
          claimedAt: new Date(),
        });
        session.isPrimaryBidder = true;
        socket.emit('seat_claimed_success');
        io.to(`auction:${session.auctionId}`).emit('bidding_seat_occupied', {
          vendorId: session.vendorId,
          auctionId: session.auctionId,
        });
      } else {
        socket.emit('error_message', {
          code: 'SEAT_UNAVAILABLE',
          message: 'The bidding seat is currently held by a teammate.',
        });
      }
    });

    // 2. Submit reverse auction bid
    socket.on('submit_bid', (data: { lotId: string; amount: number }) => {
      const session = socket.data;

      if (!session || !session.auctionId) {
        return socket.emit('error_message', {
          code: 'UNAUTHORIZED',
          message: 'You must join the room first.',
        });
      }

      if (session.role === 'customer_observer') {
        return socket.emit('error_message', {
          code: 'OBSERVER_CANNOT_BID',
          message: 'Customer Observers are in read-only mode and cannot place bids.',
        });
      }

      // Concurrency check: only the Primary Bidder can submit bids
      if (session.role === 'vendor' && !session.isPrimaryBidder) {
        return socket.emit('error_message', {
          code: 'NOT_PRIMARY_BIDDER',
          message: 'Your terminal is in Read-Only Mirror mode. A teammate is holding the active bidding seat for your company.',
        });
      }

      // Strict Enterprise Clock & Status Check
      const activeAuction = db
        .prepare('SELECT status, current_end FROM auctions WHERE id = ?')
        .get(session.auctionId) as { status: string; current_end: string } | undefined;

      if (!activeAuction || (activeAuction.status !== 'live' && activeAuction.status !== 'extended')) {
        return socket.emit('error_message', {
          code: 'AUCTION_NOT_LIVE',
          message: `Bidding is strictly closed. This tender is currently in "${activeAuction?.status || 'unknown'}" status.`,
        });
      }

      if (new Date() > new Date(activeAuction.current_end)) {
        return socket.emit('error_message', {
          code: 'AUCTION_EXPIRED',
          message: 'The official bidding window has expired. No further bids are accepted.',
        });
      }

      const prevLot = db
        .prepare('SELECT current_l1_vendor_id FROM lots WHERE id = ?')
        .get(data.lotId) as { current_l1_vendor_id: string | null } | undefined;
      const previousL1VendorId = prevLot?.current_l1_vendor_id;

      try {
        const bidResult = repo.placeBid(data.lotId, session.vendorId, data.amount);
        const roomName = `auction:${session.auctionId}`;

        io.to(roomName).emit('bid_placed', {
          lotId: data.lotId,
          amount: bidResult.amount,
          newMaxAllowedBid: bidResult.newMaxAllowedBid,
          vendorCompanyName: session.companyName,
          timestamp: new Date().toISOString(),
        });

        // Outbid alert routing
        if (previousL1VendorId && previousL1VendorId !== session.vendorId) {
          // Standard in-room alert
          io.to(roomName).emit('outbid_alert', {
            lotId: data.lotId,
            outbidVendorId: previousL1VendorId,
            newLowestBid: bidResult.amount,
          });

          // Smart Presence Routing: Check if previous L1 vendor has anyone in this room
          const isManned = isVendorPresentInAuction(session.auctionId, previousL1VendorId);
          if (!isManned) {
            // Tender is UNMANNED by that company! Emit cross-auction urgent alert to their company channel
            const lotRow = db.prepare('SELECT product_name FROM lots WHERE id = ?').get(data.lotId) as any;
            const auctionRow = db.prepare('SELECT title FROM auctions WHERE id = ?').get(session.auctionId) as any;

            io.to(`vendor:${previousL1VendorId}`).emit('cross_auction_unattended_alert', {
              type: 'outbid',
              auctionId: session.auctionId,
              auctionTitle: auctionRow?.title || session.auctionId,
              lotId: data.lotId,
              productName: lotRow?.product_name || `Lot #${data.lotId}`,
              newLowestBid: bidResult.amount,
              message: `⚠️ Unattended Tender Alert: You were OUTBID on ${lotRow?.product_name || 'your lot'} in "${auctionRow?.title || session.auctionId}"! No active bidder from your company is in that room.`,
            });
          }
        }

        const auction = db
          .prepare('SELECT * FROM auctions WHERE id = ?')
          .get(session.auctionId) as any;

        if (auction) {
          const config: AuctionTimerConfig = {
            scheduledStartTime: new Date(auction.scheduled_start),
            scheduledEndTime: new Date(auction.scheduled_end),
            antiSnipingTriggerMinutes: auction.anti_sniping_minutes,
            extensionStepMinutes: auction.extension_step_minutes,
            maxBufferMinutes: auction.max_buffer_minutes,
          };

          const currentEnd = new Date(auction.current_end);
          const extension = evaluateAntiSniping(config, currentEnd);

          if (extension.extended) {
            db.prepare('UPDATE auctions SET current_end = ?, status = ? WHERE id = ?').run(
              extension.newEndTime.toISOString(),
              'extended',
              session.auctionId
            );

            io.to(roomName).emit('auction_extended', {
              newEndTime: extension.newEndTime.toISOString(),
              isHardStopReached: extension.isHardStopReached,
            });
          }
        }
      } catch (err: any) {
        socket.emit('error_message', { code: 'INVALID_BID', message: err.message });
      }
    });

    // Handle Disconnect (60-second grace seat retention + presence removal)
    socket.on('disconnect', () => {
      const session = socket.data;
      if (!session || !session.auctionId) return;

      if (session.vendorId) {
        // Remove from presence tracking
        const vMap = auctionVendorPresence.get(session.auctionId);
        if (vMap && vMap.has(session.vendorId)) {
          const sockets = vMap.get(session.vendorId)!;
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            vMap.delete(session.vendorId);
          }
        }

        // If this socket held the active bidding seat, hold it for 60 seconds grace
        const seatKey = `${session.auctionId}:${session.vendorId}`;
        const seat = activeBiddingSeats.get(seatKey);
        if (seat && seat.socketId === socket.id) {
          seat.disconnectTimeout = setTimeout(() => {
            activeBiddingSeats.delete(seatKey);
            io.to(`auction:${session.auctionId}`).emit('bidding_seat_available', {
              vendorId: session.vendorId,
              auctionId: session.auctionId,
            });
          }, 60000); // 60s reconnection grace window
        }
      }
    });
  });
}
