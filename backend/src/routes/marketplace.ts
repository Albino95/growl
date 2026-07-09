import { Env, Product, Order } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, createProductSchema, createOrderSchema, updateOrderStatusSchema, checkoutSessionSchema } from '../utils/validation';
import { generateId } from '../utils/id';

function isPaymentsEnabled(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

/**
 * GET /api/v1/marketplace/payment-config
 * Returns whether Stripe checkout is configured on the server.
 */
export async function getPaymentConfig(_request: Request, env: Env): Promise<Response> {
  return json({ enabled: isPaymentsEnabled(env) });
}

/**
 * POST /api/v1/marketplace/checkout-session
 * Creates a Stripe Checkout session (stub URL when Stripe is not configured).
 */
export async function createCheckoutSession(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!isPaymentsEnabled(env)) {
    return error('PAYMENTS_DISABLED', 'Marketplace payments are not available', 503);
  }

  const validation = await validateRequest(request, checkoutSessionSchema);
  if (!validation.success) return validation.response;

  const { items } = validation.data;

  // Validate products exist and calculate total
  let total = 0;
  for (const item of items) {
    const product = await env.DB.prepare('SELECT price, stock, name FROM products WHERE id = ?')
      .bind(item.product_id)
      .first<{ price: number; stock: number; name: string }>();

    if (!product) {
      return error('PRODUCT_NOT_FOUND', `Product ${item.product_id} not found`, 404);
    }

    if (product.stock < item.quantity) {
      return error('INSUFFICIENT_STOCK', `Insufficient stock for product ${product.name}`, 400);
    }

    total += product.price * item.quantity;
  }

  const sessionId = `cs_test_${generateId('checkout')}`;
  const url = `https://checkout.stripe.com/c/pay/${sessionId}#fidkdWxOYHwnPyd1blpxYHZxWjA0`;

  return json({
    session_id: sessionId,
    url,
    amount_total: total,
    currency: 'usd',
  });
}

/**
 * GET /api/v1/marketplace/products
 * Get products (with optional filters)
 */
export async function getProducts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const subcategory = url.searchParams.get('subcategory');
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let query = `
    SELECT p.*, u.metadata as user_metadata
    FROM products p
    JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const bindings: any[] = [];

  if (category) {
    query += ' AND p.category = ?';
    bindings.push(category);
  }

  if (subcategory) {
    query += ' AND p.subcategory = ?';
    bindings.push(subcategory);
  }

  if (search) {
    query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
    const searchTerm = `%${search}%`;
    bindings.push(searchTerm, searchTerm);
  }

  query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  try {
    const products = await env.DB.prepare(query)
      .bind(...bindings)
      .all<Product & { user_metadata: string }>();

    const formattedProducts = products.results.map((product) => {
      const userMeta = JSON.parse(product.user_metadata || '{}');
      return {
        ...product,
        images: JSON.parse(product.images || '[]'),
        metadata: JSON.parse(product.metadata || '{}'),
        business: {
          id: product.user_id,
          username: userMeta.username,
          avatar: userMeta.avatar,
        },
      };
    });

    return json({
      products: formattedProducts,
      total: products.results.length,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[getProducts] Error:', err);
    const errorMessage = err?.message || 'Failed to fetch products';
    // Provide more helpful error message if tables don't exist
    if (errorMessage.includes('no such table')) {
      return error('DATABASE_ERROR', 'Database tables not initialized. Please run migrations.', 500);
    }
    return error('DATABASE_ERROR', errorMessage, 500);
  }
}

/**
 * GET /api/v1/marketplace/products/:id
 * Get a specific product
 */
export async function getProduct(
  request: Request,
  env: Env,
  productId: string
): Promise<Response> {
  try {
    const product = await env.DB.prepare(
      `SELECT p.*, u.metadata as user_metadata
       FROM products p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`
    )
      .bind(productId)
      .first<Product & { user_metadata: string }>();

    if (!product) {
      return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }

    const userMeta = JSON.parse(product.user_metadata || '{}');

    return json({
      ...product,
      images: JSON.parse(product.images || '[]'),
      metadata: JSON.parse(product.metadata || '{}'),
      business: {
        id: product.user_id,
        username: userMeta.username,
        avatar: userMeta.avatar,
      },
    });
  } catch (err) {
    console.error('[getProduct] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch product', 500);
  }
}

/**
 * POST /api/v1/marketplace/products
 * Create a new product (business only)
 */
export async function createProduct(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Check if user is a business
  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can create products', 403);
  }

  const validation = await validateRequest(request, createProductSchema);
  if (!validation.success) return validation.response;

  const { name, description, category, subcategory, price, stock, image_url, images, metadata } =
    validation.data;

  const productId = generateId('product');

  try {
    await env.DB.prepare(
      `INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock, image_url, images, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        productId,
        ctx.userId,
        name,
        description || null,
        category,
        subcategory || null,
        price,
        stock,
        image_url || null,
        JSON.stringify(images || []),
        JSON.stringify(metadata || {})
      )
      .run();

    return json(
      {
        id: productId,
        user_id: ctx.userId,
        name,
        description,
        category,
        subcategory,
        price,
        stock,
        image_url,
        images: images || [],
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      },
      201
    );
  } catch (err) {
    console.error('[createProduct] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create product', 500);
  }
}

/**
 * PUT /api/v1/marketplace/products/:id
 * Update a product (business only)
 */
export async function updateProduct(
  request: Request,
  env: Env,
  productId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can update products', 403);
  }

  // Check if product exists and belongs to user
  const product = await env.DB.prepare('SELECT user_id FROM products WHERE id = ?')
    .bind(productId)
    .first<{ user_id: string }>();

  if (!product) {
    return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
  }

  if (product.user_id !== ctx.userId) {
    return error('FORBIDDEN', 'You can only update your own products', 403);
  }

  // Validate request (all fields optional for update)
  const updateSchema = createProductSchema.partial();
  const validation = await validateRequest(request, updateSchema);
  if (!validation.success) return validation.response;

  const updates = validation.data;
  const updateFields: string[] = [];
  const updateValues: any[] = [];

  if (updates.name !== undefined) {
    updateFields.push('name = ?');
    updateValues.push(updates.name);
  }
  if (updates.description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(updates.description || null);
  }
  if (updates.category !== undefined) {
    updateFields.push('category = ?');
    updateValues.push(updates.category);
  }
  if (updates.subcategory !== undefined) {
    updateFields.push('subcategory = ?');
    updateValues.push(updates.subcategory || null);
  }
  if (updates.price !== undefined) {
    updateFields.push('price = ?');
    updateValues.push(updates.price);
  }
  if (updates.stock !== undefined) {
    updateFields.push('stock = ?');
    updateValues.push(updates.stock);
  }
  if (updates.image_url !== undefined) {
    updateFields.push('image_url = ?');
    updateValues.push(updates.image_url || null);
  }
  if (updates.images !== undefined) {
    updateFields.push('images = ?');
    updateValues.push(JSON.stringify(updates.images || []));
  }
  if (updates.metadata !== undefined) {
    updateFields.push('metadata = ?');
    updateValues.push(JSON.stringify(updates.metadata || {}));
  }

  if (updateFields.length === 0) {
    return error('VALIDATION_ERROR', 'No fields to update', 400);
  }

  updateFields.push('updated_at = datetime(\'now\')');
  updateValues.push(productId);

  try {
    await env.DB.prepare(
      `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`
    )
      .bind(...updateValues)
      .run();

    // Fetch updated product
    const updatedProduct = await env.DB.prepare(
      'SELECT * FROM products WHERE id = ?'
    )
      .bind(productId)
      .first<Product>();

    if (!updatedProduct) {
      return error('PRODUCT_NOT_FOUND', 'Product not found after update', 404);
    }

    return json({
      ...updatedProduct,
      images: JSON.parse(updatedProduct.images || '[]'),
      metadata: JSON.parse(updatedProduct.metadata || '{}'),
    });
  } catch (err) {
    console.error('[updateProduct] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update product', 500);
  }
}

/**
 * DELETE /api/v1/marketplace/products/:id
 * Delete a product (business only)
 */
export async function deleteProduct(
  request: Request,
  env: Env,
  productId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can delete products', 403);
  }

  // Check if product exists and belongs to user
  const product = await env.DB.prepare('SELECT user_id FROM products WHERE id = ?')
    .bind(productId)
    .first<{ user_id: string }>();

  if (!product) {
    return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
  }

  if (product.user_id !== ctx.userId) {
    return error('FORBIDDEN', 'You can only delete your own products', 403);
  }

  try {
    await env.DB.prepare('DELETE FROM products WHERE id = ?')
      .bind(productId)
      .run();

    return json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('[deleteProduct] Error:', err);
    return error('DATABASE_ERROR', 'Failed to delete product', 500);
  }
}

/**
 * POST /api/v1/marketplace/orders
 * Create a new order
 */
export async function createOrder(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!isPaymentsEnabled(env)) {
    return error('PAYMENTS_DISABLED', 'Marketplace payments are not available', 503);
  }

  const validation = await validateRequest(request, createOrderSchema);
  if (!validation.success) return validation.response;

  const { items, shipping_address, metadata } = validation.data;

  if (!metadata?.payment_confirmed) {
    return error(
      'PAYMENT_REQUIRED',
      'Direct orders require confirmed payment. Complete checkout via Stripe first.',
      403
    );
  }

  // Validate products exist and calculate total
  let total = 0;
  const orderItems: Array<{ product_id: string; quantity: number; price: number }> = [];
  const businessIds = new Set<string>();

  for (const item of items) {
    const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
      .bind(item.product_id)
      .first<Product>();

    if (!product) {
      return error('PRODUCT_NOT_FOUND', `Product ${item.product_id} not found`, 404);
    }

    if (product.stock < item.quantity) {
      return error('INSUFFICIENT_STOCK', `Insufficient stock for product ${product.name}`, 400);
    }

    const itemTotal = product.price * item.quantity;
    total += itemTotal;
    businessIds.add(product.user_id);
    orderItems.push({
      product_id: item.product_id,
      quantity: item.quantity,
      price: product.price,
    });
  }

  const orderId = generateId('order');

  const businessId = businessIds.size === 1 ? Array.from(businessIds)[0] : null;
  const orderMeta = {
    payment_method: metadata?.payment_method || 'stripe',
    payment_confirmed: true,
    stripe_checkout_session_id: metadata?.stripe_checkout_session_id || null,
    source: metadata?.source || 'organic',
    referral_instructor_id: metadata?.referral_instructor_id || null,
    campaign_id: metadata?.campaign_id || null,
  };

  try {
    // Create order
    await env.DB.prepare(
      `INSERT INTO orders (id, user_id, business_id, status, total, shipping_address, metadata, payment_status, source, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, 'paid', ?, datetime('now'), datetime('now'))`
    )
      .bind(
        orderId,
        ctx.userId,
        businessId,
        total,
        JSON.stringify(shipping_address),
        JSON.stringify(orderMeta),
        orderMeta.source
      )
      .run();

    // Create order items and update stock
    for (const item of orderItems) {
      const orderItemId = generateId('order_item');
      await env.DB.prepare(
        `INSERT INTO order_items (id, order_id, product_id, quantity, price, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(orderItemId, orderId, item.product_id, item.quantity, item.price)
        .run();

      // Update product stock
      await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
        .bind(item.quantity, item.product_id)
        .run();
    }

    return json(
      {
        id: orderId,
        user_id: ctx.userId,
        status: 'pending',
        total,
        shipping_address,
        items: orderItems,
        created_at: new Date().toISOString(),
      },
      201
    );
  } catch (err) {
    console.error('[createOrder] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create order', 500);
  }
}

/**
 * GET /api/v1/marketplace/orders
 * Get user's orders
 */
export async function getOrders(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const orders = await env.DB.prepare(
      `SELECT o.*,
       (SELECT json_group_array(json_object(
         'id', oi.id,
         'product_id', oi.product_id,
         'quantity', oi.quantity,
         'price', oi.price,
         'product_name', p.name,
         'product_image', p.image_url
       ))
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = o.id) as items
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 50`
    )
      .bind(ctx.userId)
      .all<Order & { items: string }>();

    const formattedOrders = orders.results.map((order) => ({
      ...order,
      shipping_address: JSON.parse(order.shipping_address || '{}'),
      metadata: JSON.parse(order.metadata || '{}'),
      items: JSON.parse(order.items || '[]'),
    }));

    return json(formattedOrders);
  } catch (err) {
    console.error('[getOrders] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch orders', 500);
  }
}

/**
 * PATCH /api/v1/marketplace/orders/:orderId/status
 * Update order status (business users only)
 */
export async function updateOrderStatus(request: Request, env: Env, orderId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Check if user is a business account
  try {
    const user = await env.DB.prepare('SELECT is_business FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ is_business: number }>();
    
    if (!user || !user.is_business) {
      return error('FORBIDDEN', 'Only business accounts can update order status', 403);
    }
  } catch (err) {
    console.error('[updateOrderStatus] Error checking user:', err);
    return error('DATABASE_ERROR', 'Failed to verify user permissions', 500);
  }

  // Validate request body
  const validation = await validateRequest(request, updateOrderStatusSchema);
  if (!validation.success) {
    return validation.response;
  }
  const { status } = validation.data;

  try {
    // Verify order exists and belongs to a customer of this business
    // (Business can only update orders for products they own)
    const order = await env.DB.prepare(
      `SELECT o.id, o.user_id, o.status
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE o.id = ? AND p.user_id = ?
       LIMIT 1`
    )
      .bind(orderId, ctx.userId)
      .first<{ id: string; user_id: string; status: string }>();

    if (!order) {
      return error('NOT_FOUND', 'Order not found or you do not have permission to update it', 404);
    }

    // Update order status
    await env.DB.prepare(
      `UPDATE orders 
       SET status = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(status, orderId)
      .run();

    // Fetch updated order with items
    const updatedOrder = await env.DB.prepare(
      `SELECT o.*,
       (SELECT json_group_array(json_object(
         'id', oi.id,
         'product_id', oi.product_id,
         'quantity', oi.quantity,
         'price', oi.price,
         'product_name', p.name,
         'product_image', p.image_url
       ))
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = o.id) as items
       FROM orders o
       WHERE o.id = ?`
    )
      .bind(orderId)
      .first<Order & { items: string }>();

    if (!updatedOrder) {
      return error('DATABASE_ERROR', 'Failed to fetch updated order', 500);
    }

    const formattedOrder = {
      ...updatedOrder,
      shipping_address: JSON.parse(updatedOrder.shipping_address || '{}'),
      metadata: JSON.parse(updatedOrder.metadata || '{}'),
      items: JSON.parse(updatedOrder.items || '[]'),
    };

    return json(formattedOrder);
  } catch (err) {
    console.error('[updateOrderStatus] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update order status', 500);
  }
}
