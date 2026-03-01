import type { CompanyWithRole } from '@/types/company';
import type { Product } from '@/types/product';
import type { Order } from '@/types/order';

export const MOCK_COMPANIES: CompanyWithRole[] = [
  {
    id: '1',
    name: 'Sunrise Academy',
    slug: 'sunrise-academy',
    rzpay_key_id: null,
    meta: { address: '123 Education Lane, Mumbai' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    role: 'admin',
    visible_tiles: ['inventory', 'past_orders', 'create_order'],
  },
  {
    id: '2',
    name: 'Green Valley School',
    slug: 'green-valley',
    rzpay_key_id: null,
    meta: { address: '456 Knowledge Park, Delhi' },
    created_at: '2024-02-15T00:00:00Z',
    updated_at: '2024-02-15T00:00:00Z',
    role: 'employee',
    visible_tiles: ['inventory', 'create_order'],
  },
  {
    id: '3',
    name: 'Bright Future Institute',
    slug: 'bright-future',
    rzpay_key_id: null,
    meta: { address: '789 Scholar St, Bangalore' },
    created_at: '2024-03-10T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    role: 'super_admin',
    visible_tiles: ['inventory', 'past_orders', 'create_order'],
  },
  {
    id: '4',
    name: 'Little Stars Playschool',
    slug: 'little-stars',
    rzpay_key_id: null,
    meta: { address: '321 Rainbow Road, Pune' },
    created_at: '2024-04-05T00:00:00Z',
    updated_at: '2024-04-05T00:00:00Z',
    role: 'admin',
    visible_tiles: ['inventory', 'past_orders'],
  },
];

export const MOCK_PRODUCTS: Record<string, Product[]> = {
  '1': [
    { id: 'p1-01', company_id: '1', name: 'Notebook - Ruled 100 Pages', sku: 'NB-R-100', barcode: '8901234560001', price: 4500, currency: '₹', quantity: 150, image_url: null, created_at: '2024-06-01T00:00:00Z' },
    { id: 'p1-02', company_id: '1', name: 'Pencil Box Set (12 pcs)', sku: 'PB-SET-12', barcode: '8901234560002', price: 12000, currency: '₹', quantity: 80, image_url: null, created_at: '2024-06-01T00:00:00Z' },
    { id: 'p1-03', company_id: '1', name: 'Geometry Box Standard', sku: 'GB-STD-01', barcode: '8901234560003', price: 25000, currency: '₹', quantity: 45, image_url: null, created_at: '2024-06-02T00:00:00Z' },
    { id: 'p1-04', company_id: '1', name: 'School Bag - Blue Medium', sku: 'SB-BLU-M', barcode: '8901234560004', price: 150000, currency: '₹', quantity: 30, image_url: null, created_at: '2024-06-02T00:00:00Z' },
    { id: 'p1-05', company_id: '1', name: 'Water Bottle 500ml', sku: 'WB-500-BL', barcode: '8901234560005', price: 35000, currency: '₹', quantity: 60, image_url: null, created_at: '2024-06-03T00:00:00Z' },
    { id: 'p1-06', company_id: '1', name: 'Textbook - Mathematics Grade 5', sku: 'TB-MTH-05', barcode: '8901234560006', price: 27500, currency: '₹', quantity: 100, image_url: null, created_at: '2024-06-03T00:00:00Z' },
    { id: 'p1-07', company_id: '1', name: 'Textbook - Science Grade 5', sku: 'TB-SCI-05', barcode: '8901234560007', price: 30000, currency: '₹', quantity: 95, image_url: null, created_at: '2024-06-04T00:00:00Z' },
    { id: 'p1-08', company_id: '1', name: 'Eraser Pack (5 pcs)', sku: 'ER-PCK-5', barcode: '8901234560008', price: 2500, currency: '₹', quantity: 200, image_url: null, created_at: '2024-06-04T00:00:00Z' },
    { id: 'p1-09', company_id: '1', name: 'Metal Sharpener', sku: 'SH-MTL-01', barcode: '8901234560009', price: 1500, currency: '₹', quantity: 180, image_url: null, created_at: '2024-06-05T00:00:00Z' },
    { id: 'p1-10', company_id: '1', name: 'Drawing Pad A4 (50 sheets)', sku: 'DP-A4-50', barcode: '8901234560010', price: 15000, currency: '₹', quantity: 70, image_url: null, created_at: '2024-06-05T00:00:00Z' },
    { id: 'p1-11', company_id: '1', name: 'Crayons 24-Pack', sku: 'CR-24-PKT', barcode: '8901234560011', price: 18000, currency: '₹', quantity: 55, image_url: null, created_at: '2024-06-06T00:00:00Z' },
    { id: 'p1-12', company_id: '1', name: 'School Uniform Shirt - White', sku: 'SU-SHT-W', barcode: '8901234560012', price: 45000, currency: '₹', quantity: 40, image_url: null, created_at: '2024-06-06T00:00:00Z' },
  ],
  '2': [
    { id: 'p2-01', company_id: '2', name: 'Notebook - Graph 200 Pages', sku: 'NB-G-200', barcode: '8902345670001', price: 7500, currency: '₹', quantity: 120, image_url: null, created_at: '2024-07-01T00:00:00Z' },
    { id: 'p2-02', company_id: '2', name: 'Ball Pen Blue (Pack of 10)', sku: 'BP-BLU-10', barcode: '8902345670002', price: 8000, currency: '₹', quantity: 200, image_url: null, created_at: '2024-07-01T00:00:00Z' },
    { id: 'p2-03', company_id: '2', name: 'Lab Coat - Small', sku: 'LC-SML-01', barcode: '8902345670003', price: 55000, currency: '₹', quantity: 25, image_url: null, created_at: '2024-07-02T00:00:00Z' },
    { id: 'p2-04', company_id: '2', name: 'Microscope - Student', sku: 'MS-STD-01', barcode: '8902345670004', price: 350000, currency: '₹', quantity: 10, image_url: null, created_at: '2024-07-02T00:00:00Z' },
    { id: 'p2-05', company_id: '2', name: 'Science Kit Grade 8', sku: 'SK-GR8-01', barcode: '8902345670005', price: 120000, currency: '₹', quantity: 35, image_url: null, created_at: '2024-07-03T00:00:00Z' },
    { id: 'p2-06', company_id: '2', name: 'Compass & Divider Set', sku: 'CD-SET-01', barcode: '8902345670006', price: 15000, currency: '₹', quantity: 90, image_url: null, created_at: '2024-07-03T00:00:00Z' },
    { id: 'p2-07', company_id: '2', name: 'A4 Printer Paper (500 sheets)', sku: 'PP-A4-500', barcode: '8902345670007', price: 22000, currency: '₹', quantity: 50, image_url: null, created_at: '2024-07-04T00:00:00Z' },
    { id: 'p2-08', company_id: '2', name: 'Whiteboard Marker Set', sku: 'WM-SET-04', barcode: '8902345670008', price: 18000, currency: '₹', quantity: 65, image_url: null, created_at: '2024-07-04T00:00:00Z' },
  ],
  '3': [
    { id: 'p3-01', company_id: '3', name: 'Notebook - Plain 200 Pages', sku: 'NB-P-200', barcode: '8903456780001', price: 6000, currency: '₹', quantity: 130, image_url: null, created_at: '2024-08-01T00:00:00Z' },
    { id: 'p3-02', company_id: '3', name: 'Calculator - Scientific', sku: 'CL-SCI-01', barcode: '8903456780002', price: 85000, currency: '₹', quantity: 40, image_url: null, created_at: '2024-08-01T00:00:00Z' },
    { id: 'p3-03', company_id: '3', name: 'Sports Shoes - White', sku: 'SS-WHT-M', barcode: '8903456780003', price: 180000, currency: '₹', quantity: 20, image_url: null, created_at: '2024-08-02T00:00:00Z' },
    { id: 'p3-04', company_id: '3', name: 'Art Sketch Book A3', sku: 'AS-A3-40', barcode: '8903456780004', price: 25000, currency: '₹', quantity: 55, image_url: null, created_at: '2024-08-02T00:00:00Z' },
    { id: 'p3-05', company_id: '3', name: 'Oil Pastels (36 shades)', sku: 'OP-36-01', barcode: '8903456780005', price: 35000, currency: '₹', quantity: 45, image_url: null, created_at: '2024-08-03T00:00:00Z' },
    { id: 'p3-06', company_id: '3', name: 'Hindi Textbook Grade 7', sku: 'TB-HIN-07', barcode: '8903456780006', price: 22000, currency: '₹', quantity: 80, image_url: null, created_at: '2024-08-03T00:00:00Z' },
    { id: 'p3-07', company_id: '3', name: 'English Textbook Grade 7', sku: 'TB-ENG-07', barcode: '8903456780007', price: 24000, currency: '₹', quantity: 85, image_url: null, created_at: '2024-08-04T00:00:00Z' },
    { id: 'p3-08', company_id: '3', name: 'School Tie - Striped', sku: 'ST-STR-01', barcode: '8903456780008', price: 15000, currency: '₹', quantity: 60, image_url: null, created_at: '2024-08-04T00:00:00Z' },
  ],
  '4': [
    { id: 'p4-01', company_id: '4', name: 'Crayon Box (8 colors)', sku: 'CB-08-01', barcode: '8904567890001', price: 5000, currency: '₹', quantity: 100, image_url: null, created_at: '2024-09-01T00:00:00Z' },
    { id: 'p4-02', company_id: '4', name: 'Play-Doh Set (4 tubs)', sku: 'PD-04-01', barcode: '8904567890002', price: 25000, currency: '₹', quantity: 40, image_url: null, created_at: '2024-09-01T00:00:00Z' },
    { id: 'p4-03', company_id: '4', name: 'Picture Story Book', sku: 'PS-BK-01', barcode: '8904567890003', price: 15000, currency: '₹', quantity: 70, image_url: null, created_at: '2024-09-02T00:00:00Z' },
    { id: 'p4-04', company_id: '4', name: 'Building Blocks (50 pcs)', sku: 'BB-50-01', barcode: '8904567890004', price: 45000, currency: '₹', quantity: 25, image_url: null, created_at: '2024-09-02T00:00:00Z' },
    { id: 'p4-05', company_id: '4', name: 'Finger Paint Set', sku: 'FP-SET-06', barcode: '8904567890005', price: 20000, currency: '₹', quantity: 35, image_url: null, created_at: '2024-09-03T00:00:00Z' },
    { id: 'p4-06', company_id: '4', name: 'Kids Apron - Pink', sku: 'KA-PNK-01', barcode: '8904567890006', price: 18000, currency: '₹', quantity: 30, image_url: null, created_at: '2024-09-03T00:00:00Z' },
  ],
};

export const MOCK_ORDERS: Record<string, Order[]> = {
  '1': [
    { id: 'ord-1a2b3c4d-1111-1111-1111-111111111111', company_id: '1', total_amount: 42000, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2025-12-15T10:30:00Z' },
    { id: 'ord-2b3c4d5e-1111-1111-1111-222222222222', company_id: '1', total_amount: 175000, currency: '₹', status: 'success', payment_method: 'online', razorpay_order_id: 'order_abc1', razorpay_payment_id: 'pay_xyz1', created_at: '2025-12-18T14:20:00Z' },
    { id: 'ord-3c4d5e6f-1111-1111-1111-333333333333', company_id: '1', total_amount: 55000, currency: '₹', status: 'failed', payment_method: 'online', razorpay_order_id: 'order_abc2', razorpay_payment_id: null, created_at: '2025-12-20T09:15:00Z' },
    { id: 'ord-4d5e6f7a-1111-1111-1111-444444444444', company_id: '1', total_amount: 12500, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2026-01-05T11:00:00Z' },
    { id: 'ord-5e6f7a8b-1111-1111-1111-555555555555', company_id: '1', total_amount: 90000, currency: '₹', status: 'pending', payment_method: 'online', razorpay_order_id: 'order_abc3', razorpay_payment_id: null, created_at: '2026-01-10T16:45:00Z' },
    { id: 'ord-6f7a8b9c-1111-1111-1111-666666666666', company_id: '1', total_amount: 30000, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2026-02-01T08:30:00Z' },
  ],
  '2': [
    { id: 'ord-1a2b3c4d-2222-2222-2222-111111111111', company_id: '2', total_amount: 350000, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2025-11-20T09:00:00Z' },
    { id: 'ord-2b3c4d5e-2222-2222-2222-222222222222', company_id: '2', total_amount: 82000, currency: '₹', status: 'failed', payment_method: 'online', razorpay_order_id: 'order_gv1', razorpay_payment_id: null, created_at: '2026-01-12T15:30:00Z' },
  ],
  '3': [
    { id: 'ord-1a2b3c4d-3333-3333-3333-111111111111', company_id: '3', total_amount: 205000, currency: '₹', status: 'success', payment_method: 'online', razorpay_order_id: 'order_bf1', razorpay_payment_id: 'pay_bf1', created_at: '2025-10-05T12:00:00Z' },
    { id: 'ord-2b3c4d5e-3333-3333-3333-222222222222', company_id: '3', total_amount: 46000, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2025-11-15T10:20:00Z' },
    { id: 'ord-3c4d5e6f-3333-3333-3333-333333333333', company_id: '3', total_amount: 180000, currency: '₹', status: 'success', payment_method: 'online', razorpay_order_id: 'order_bf2', razorpay_payment_id: 'pay_bf2', created_at: '2026-01-20T14:10:00Z' },
    { id: 'ord-4d5e6f7a-3333-3333-3333-444444444444', company_id: '3', total_amount: 35000, currency: '₹', status: 'pending', payment_method: 'online', razorpay_order_id: 'order_bf3', razorpay_payment_id: null, created_at: '2026-02-10T11:45:00Z' },
  ],
  '4': [
    { id: 'ord-1a2b3c4d-4444-4444-4444-111111111111', company_id: '4', total_amount: 75000, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2025-12-01T09:30:00Z' },
    { id: 'ord-2b3c4d5e-4444-4444-4444-222222222222', company_id: '4', total_amount: 45000, currency: '₹', status: 'success', payment_method: 'cash', razorpay_order_id: null, razorpay_payment_id: null, created_at: '2026-01-08T10:00:00Z' },
    { id: 'ord-3c4d5e6f-4444-4444-4444-333333333333', company_id: '4', total_amount: 20000, currency: '₹', status: 'failed', payment_method: 'online', razorpay_order_id: 'order_ls1', razorpay_payment_id: null, created_at: '2026-02-05T16:00:00Z' },
  ],
};
