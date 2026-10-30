import { Server as SocketIOServer, Socket } from 'socket.io';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import { verifyInviteToken, type InviteRecord } from '../magic-link.js';
import { evaluateAntiSniping, type AuctionTimerConfig } from '../auction-timer.js';

export function registerAuctionSockets(
  io: SocketIOServer,
  db: Database.Database,
  repo: AuctionRepository
): void {
  io.on('connection', (socket: Socket) => {
    // 1. Join room and authenticate with Magic Link token
    socket.on('join_room', (data: { auctionId: string; token: string }) => {
      try {
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
