-- Business area query performance: seller-scoped order lookups join order_items -> products
-- by product_id, and period filters on orders(created_at).
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_business_created ON orders(business_id, created_at);
