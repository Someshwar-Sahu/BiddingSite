export interface Lot {
  id?: string;
  lot_number?: number;
  product_name: string;
  category?: string;
  quantity: number;
  uom: string;
  start_price?: number;
  reserve_price: number;
  bid_decrement: number;
  current_lowest_bid?: number | null;
  current_l1_vendor_id?: string | null;
}

export interface TenderRequest {
  id: string;
  request_number: string;
  title: string;
  category: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  target_date?: string;
  duration_minutes: number;
  delivery_location: string;
  special_terms: string;
  lots: Lot[];
  suggested_vendors: any[];
  status: 'pending_review' | 'approved' | 'rejected';
  admin_revised?: number;
  admin_revised_at?: string;
  customer_approved?: number;
  customer_approved_at?: string;
  created_at?: string;
}

export interface Auction {
  id: string;
  title: string;
  customer_org_id: string;
  customer_name?: string;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  anti_sniping_minutes: number;
  extension_step_minutes: number;
  max_buffer_minutes: number;
  current_end: string;
  status: 'scheduled' | 'live' | 'extended' | 'ended' | 'cancelled';
  category?: string;
  delivery_location?: string;
  special_instructions?: string;
  lots?: Lot[];
  totalReserve?: number;
  observerUrl?: string;
}

export interface Facility {
  id: string;
  facility_name: string;
  city: string;
  state: string;
  address?: string;
}

export interface Vendor {
  id: string;
  company_name: string;
  contact_person?: string;
  email: string;
  phone?: string;
  status?: string;
  gstin?: string;
  pan?: string;
  assigned_companies?: string;
}

export interface Amendment {
  id: string;
  auction_id: string;
  auction_title?: string;
  customer_org_id: string;
  customer_org_name?: string;
  amendment_type: 'reschedule' | 'quantity_ceiling' | 'delivery_terms' | 'comprehensive';
  details: any;
  reason: string;
  status: 'pending_review' | 'approved' | 'rejected';
  admin_notes?: string;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  gstin?: string;
  email: string;
  phone?: string;
}

export interface NotificationItem {
  id: string;
  recipient_role: 'admin' | 'customer' | 'all';
  recipient_org_id?: string;
  title: string;
  message: string;
  type: string;
  target_url?: string;
  is_read: number;
  created_at: string;
}
