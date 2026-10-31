import { Server as SocketIOServer, Socket } from 'socket.io';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import { verifyInviteToken, type InviteRecord } from '../magic-link.js';
import { evaluateAntiSniping, type AuctionTimerConfig } from '../auction-timer.js';
import { parseCookies, validateSession } from '../auth.js';

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
          // Future vendor realm isolation: never join admin or corporate buyer rooms
        }
      } catch (e) {}
    };

    // Apply authorization upon connection based on handshake auth
    applyNotificationAuth();

    // Client widget explicitly declares and authenticates realm
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
        // Direct session authentication for Corporate Buyer or Operations Lead
        if (!data.token) {
          const cookies = parseCookies(socket.handshake.headers.cookie);
          const custSession = validateSession(db, cookies['nta_customer_session']);
          const adminSession = validateSession(db, cookies['nta_admin_session']);

          if (custSession && custSession.role === 'customer') {
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
          } else if (adminSession && adminSession.role === 'admin') {
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
          }

          return socket.emit('error_message', {
            code: 'INVALID_TOKEN',
            message: 'Authentication token or active buyer session required to view this auction room.',
          });
        }

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

        // Map SQLite snake_case columns to camelCase InviteRecord
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

        socket.data = {
          auctionId: data.auctionId,
          role: auth.role,
          vendorId: invite.vendor_id,
          companyName: companyName || 'Participant',
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
        });
      } catch (err: any) {
        socket.emit('error_message', {
          code: 'SERVER_ERROR',
          message: err.message || 'An error occurred while joining the auction room.',
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

        if (previousL1VendorId && previousL1VendorId !== session.vendorId) {
          io.to(roomName).emit('outbid_alert', {
            lotId: data.lotId,
            outbidVendorId: previousL1VendorId,
            newLowestBid: bidResult.amount,
          });
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
  });
}
