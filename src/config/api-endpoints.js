export const API_ENDPOINTS = Object.freeze({
  auth: Object.freeze({
    signIn: '/api/auth/signin',
    signUp: '/api/auth/signup',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
    password: '/api/auth/me/password'
  }),
  health: '/api/health',
  companySettings: '/api/company-settings',
  customers: '/api/customers',
  customerNextId: '/api/customers/next-id',
  customerStatement: (id) => `/api/customers/${id}/statement`,
  customerById: (id) => `/api/customers/${id}`,
  customerCustomFields: '/api/customer-custom-fields',
  vendors: '/api/vendors',
  vendorNextId: '/api/vendors/next-id',
  vendorStatement: (id) => `/api/vendors/${id}/statement`,
  vendorById: (id) => `/api/vendors/${id}`,
  vendorCustomFields: '/api/vendor-custom-fields',
  products: '/api/products',
  productById: (id) => `/api/products/${id}`,
  invoices: '/api/invoices',
  invoiceNextNumber: '/api/invoices/next-number',
  invoiceDetail: (id) => `/api/invoices/detail/${id}`,
  invoiceHistory: (id) => `/api/invoices/${id}/history`,
  invoiceById: (id) => `/api/invoices/${id}`,
  payments: '/api/payments',
  paymentNextNumber: '/api/payments/next-number',
  paymentPending: '/api/payments/pending',
  paymentDetail: (id) => `/api/payments/detail/${id}`,
  paymentHistory: (id) => `/api/payments/${id}/history`,
  paymentById: (id) => `/api/payments/${id}`,
  purchaseInvoices: '/api/purchase-invoices',
  purchaseInvoiceNextNumber: '/api/purchase-invoices/next-number',
  purchaseInvoiceDetail: (id) => `/api/purchase-invoices/detail/${id}`,
  purchaseInvoiceHistory: (id) => `/api/purchase-invoices/${id}/history`,
  purchaseInvoiceById: (id) => `/api/purchase-invoices/${id}`,
  purchasePayments: '/api/purchase-payments',
  purchasePaymentNextNumber: '/api/purchase-payments/next-number',
  purchasePaymentPending: '/api/purchase-payments/pending',
  purchasePaymentDetail: (id) => `/api/purchase-payments/detail/${id}`,
  purchasePaymentHistory: (id) => `/api/purchase-payments/${id}/history`,
  purchasePaymentById: (id) => `/api/purchase-payments/${id}`,
  reports: '/api/reports',
  dashboard: Object.freeze({
    base: '/api/dashboard',
    summary: '/api/dashboard/summary',
    customerOverview: '/api/dashboard/customer-overview',
    vendorOverview: '/api/dashboard/vendor-overview'
  }),
  users: '/api/users',
  backups: Object.freeze({
    base: '/api/backups',
    list: '/api/backups/list',
    download: '/api/backups/download'
  }),
  loadBalancing: Object.freeze({
    base: '/api/admin/load-balancing',
    metrics: '/api/admin/load-balancing/metrics',
    activities: '/api/admin/load-balancing/activities'
  }),
  rateLimitActivities: Object.freeze({
    base: '/api/admin/rate-limit-activities',
    stats: '/api/admin/rate-limit-activities/stats',
    apis: '/api/admin/rate-limit-activities/apis',
    live: '/api/admin/rate-limit-activities/live'
  })
})
