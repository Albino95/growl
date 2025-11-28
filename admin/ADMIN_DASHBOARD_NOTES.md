# Admin Dashboard - Planning Notes

## Purpose
Admin dashboard for managing the Growl platform, including user management, business account provisioning, content moderation, and platform analytics.

## Key Features to Implement

### 1. User Management
- **View all users** (with filters: regular, instructor, business)
- **User details**: Points, engagement, categories, metadata
- **Actions**:
  - Grant/revoke instructor status
  - **Grant business account** (primary admin function)
  - Suspend/ban users
  - Reset passwords
  - View user activity logs

### 2. Business Account Management
- **Business account provisioning**:
  - Only admins can create business accounts
  - Set business type (store, service, etc.)
  - Assign initial permissions
  - Set up business profile
- **Business oversight**:
  - View all businesses
  - Monitor business KPIs
  - Review partnership requests
  - Audit business activities

### 3. Instructor Management
- **Instructor approval**:
  - Review instructor applications (500+ points + votes)
  - Approve/reject instructor status
  - Set instructor categories
- **Instructor oversight**:
  - Monitor instructor performance
  - Review student progress
  - Manage instructor partnerships
  - Handle instructor disputes

### 4. Content Moderation
- **Post moderation**:
  - Flagged content queue
  - Review reported posts
  - Remove inappropriate content
  - Ban users for violations
- **Product moderation**:
  - Review new products
  - Verify product claims
  - Remove prohibited items

### 5. Marketplace Management
- **Promotion oversight**:
  - Review promotion requests
  - Monitor promotion performance
  - Set marketplace rules
  - Manage promotion budgets
- **Category management**:
  - Add/edit/remove categories
  - Set category rules
  - Manage subcategories

### 6. Analytics & Reporting
- **Platform metrics**:
  - Total users (by type)
  - Daily/monthly active users
  - Engagement metrics
  - Revenue metrics
- **Business metrics**:
  - Total businesses
  - Business revenue
  - Partnership statistics
- **Instructor metrics**:
  - Total instructors
  - Student counts
  - Instructor earnings
- **Content metrics**:
  - Posts per day
  - Engagement rates
  - Category distribution

### 7. Voting System Management
- **Instructor voting**:
  - Monitor voting activity
  - Review vote patterns
  - Detect vote manipulation
  - Approve instructor candidates
- **Vote validation**:
  - Ensure one vote per user
  - Verify voter eligibility
  - Handle vote disputes

### 8. Financial Management
- **Revenue tracking**:
  - Platform fees
  - Business commissions
  - Instructor earnings
  - Partnership fees
- **Payouts**:
  - Instructor payouts
  - Business payouts
  - Fee calculations
  - Payment history

### 9. System Configuration
- **Settings**:
  - Platform-wide settings
  - Feature flags
  - Maintenance mode
  - Email templates
- **Integrations**:
  - Payment providers
  - Analytics tools
  - Notification services

### 10. Security & Compliance
- **Security**:
  - Access logs
  - Failed login attempts
  - Suspicious activity
  - IP blocking
- **Compliance**:
  - GDPR compliance tools
  - Data export
  - User deletion
  - Privacy settings

## Technical Considerations

### Authentication
- **Admin authentication**: Separate from regular users
- **Role-based access**: Different admin levels
- **2FA**: Required for admin accounts
- **Session management**: Secure admin sessions

### Database Schema Additions
```sql
-- Admin users
CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT, -- 'super_admin', 'admin', 'moderator'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin actions log
CREATE TABLE admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES admins(id),
  action TEXT,
  target_type TEXT, -- 'user', 'business', 'post', etc.
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Business account requests (if needed)
CREATE TABLE business_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  business_name TEXT,
  business_type TEXT,
  status TEXT, -- 'pending', 'approved', 'rejected'
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints Needed
```
/api/admin/
  POST /auth/login
  GET /users
  GET /users/:id
  POST /users/:id/business - Grant business access
  POST /users/:id/instructor - Grant instructor access
  DELETE /users/:id
  GET /businesses
  GET /instructors
  GET /analytics
  GET /moderation/flagged
  POST /moderation/approve
  POST /moderation/reject
  GET /logs
```

## UI/UX Considerations

### Dashboard Layout
- **Sidebar navigation**: Main sections
- **Top bar**: Search, notifications, user menu
- **Main content**: Data tables, charts, forms
- **Modals**: For quick actions

### Key Screens
1. **Dashboard Home**: Overview metrics, recent activity
2. **Users**: User list with filters, user detail view
3. **Businesses**: Business list, business detail, provisioning form
4. **Instructors**: Instructor list, approval queue
5. **Content Moderation**: Flagged content queue
6. **Analytics**: Charts and reports
7. **Settings**: Platform configuration

### Design Principles
- **Clear hierarchy**: Important actions prominent
- **Quick actions**: Bulk operations, filters
- **Data visualization**: Charts for metrics
- **Responsive**: Works on desktop and tablet
- **Accessible**: WCAG compliant

## Implementation Priority

### Phase 1: MVP (Essential)
1. User management (view, search, filter)
2. Business account provisioning (CRITICAL)
3. Basic analytics
4. Content moderation (flagged posts)

### Phase 2: Enhanced
1. Instructor approval workflow
2. Advanced analytics
3. Financial management
4. Security features

### Phase 3: Advanced
1. Automated moderation
2. Machine learning insights
3. Advanced reporting
4. Custom integrations

## Security Best Practices

1. **Admin access**: Separate authentication system
2. **Audit logs**: All admin actions logged
3. **Role-based access**: Limit permissions
4. **Rate limiting**: Prevent abuse
5. **IP whitelisting**: Optional for sensitive operations
6. **2FA**: Required for all admins
7. **Session timeout**: Auto-logout after inactivity

## Future Enhancements

1. **AI-powered moderation**: Auto-flag suspicious content
2. **Predictive analytics**: Forecast trends
3. **Automated workflows**: Auto-approve based on criteria
4. **Mobile admin app**: Manage on-the-go
5. **Custom reports**: Build custom analytics
6. **Integration hub**: Connect with external tools

## Notes for Development

- **Start simple**: MVP with core features first
- **Iterate**: Add features based on needs
- **User feedback**: Gather admin feedback early
- **Documentation**: Keep admin docs updated
- **Testing**: Thorough testing before release
- **Backup**: Regular database backups
- **Monitoring**: Track admin actions and errors

