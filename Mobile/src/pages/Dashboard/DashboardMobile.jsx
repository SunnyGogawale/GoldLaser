import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  HandCoins,
  Mail,
  Phone,
  Search,
  Store,
  UserRound,
  Users
} from 'lucide-react'
import '../../styles/dashboard-mobile.css'

function MetricCard({ label, value, caption, icon: Icon, color, featured = false, loading = false }) {
  return (
    <article className={`dashboard-mobile-card${featured ? ' dashboard-mobile-card--featured' : ''}`}>
      <div className="dashboard-mobile-card__heading">
        <span>{label}</span>
        <Icon className="dashboard-mobile-card__icon" color={color} size={16} aria-hidden="true" />
      </div>
      <div className="dashboard-mobile-card__summary">
        <strong aria-live={loading ? 'polite' : undefined}>{loading ? '…' : value}</strong>
        {caption && <span>{caption}</span>}
      </div>
    </article>
  )
}

function OverviewCard({ item, type, formatMoney, onCustomerOpen }) {
  const name = type === 'customers'
    ? item.customerName || `${item.firstName || ''} ${item.lastName || ''}`.replace(/\s+/g, ' ').trim()
    : item.vendorName || `${item.firstName || ''} ${item.lastName || ''}`.replace(/\s+/g, ' ').trim()
  const companyName = item.companyName || ''
  const contactNumber = item.contactNumber || ''
  const email = item.email || ''
  const pendingAmount = Number(item.pendingAmount) || 0
  const initial = (companyName || name || '?').trim().charAt(0).toUpperCase()
  const identity = (
    <>
      <span className="dashboard-mobile-overview-card__avatar" aria-hidden="true">{initial}</span>
      <span className="dashboard-mobile-overview-card__primary">
        <span className="dashboard-mobile-overview-card__label">Company Name</span>
        <strong>{companyName || name || '-'}</strong>
      </span>
      {onCustomerOpen && <ArrowRight className="dashboard-mobile-overview-card__chevron" size={18} aria-hidden="true" />}
    </>
  )

  return (
    <article className="dashboard-mobile-overview-card">
      {onCustomerOpen ? (
        <button
          type="button"
          className="dashboard-mobile-overview-card__identity dashboard-mobile-overview-card__identity--button"
          aria-label={`View profile for ${name || companyName || 'customer'}`}
          onClick={onCustomerOpen}
        >
          {identity}
        </button>
      ) : (
        <div className="dashboard-mobile-overview-card__identity">{identity}</div>
      )}

      <div className="dashboard-mobile-overview-card__details">
        <div className="dashboard-mobile-overview-card__detail">
          <UserRound size={15} aria-hidden="true" />
          <div>
            <span className="dashboard-mobile-overview-card__label">{type === 'customers' ? 'Customer Name' : 'Vendor Name'}</span>
            <span>{name || '-'}</span>
          </div>
        </div>
        <div className="dashboard-mobile-overview-card__detail">
          <Phone size={15} aria-hidden="true" />
          <div>
            <span className="dashboard-mobile-overview-card__label">Mobile</span>
            <span>{contactNumber || '-'}</span>
          </div>
        </div>
        <div className="dashboard-mobile-overview-card__detail">
          <Mail size={15} aria-hidden="true" />
          <div>
            <span className="dashboard-mobile-overview-card__label">Email</span>
            <span className="dashboard-mobile-overview-card__email">{email || '-'}</span>
          </div>
        </div>
        <div className="dashboard-mobile-overview-card__detail dashboard-mobile-overview-card__detail--amount">
          <FileText size={15} aria-hidden="true" />
          <div>
            <span className="dashboard-mobile-overview-card__label">Outstanding</span>
            <strong className={pendingAmount < 0 ? 'is-credit' : pendingAmount > 0 ? 'is-debit' : ''}>
              ${formatMoney(Math.abs(pendingAmount), 2)}
            </strong>
          </div>
        </div>
      </div>
    </article>
  )
}

function MetricSection({ title, children }) {
  return (
    <section className="dashboard-mobile-section" aria-label={`${title} summary`}>
      <div className="dashboard-mobile-section__heading">
        <h2>{title}</h2>
        <span><CalendarDays size={13} aria-hidden="true" /> Last 30 Days</span>
      </div>
      <div className="dashboard-mobile-metrics">
        {children}
      </div>
    </section>
  )
}

export default function DashboardMobile({
  isAdmin,
  summaryLoading,
  totalCustomers,
  totalVendors,
  monthlySalesInvoices,
  monthlySalesPayments,
  salesOutstanding,
  monthlyPurchaseInvoices,
  monthlyPurchasePayments,
  purchaseOutstanding,
  totalSaleInvoiceRows,
  totalSalePaymentRows,
  totalPurchaseInvoiceRows,
  totalPurchasePaymentRows,
  formatMoney,
  overviewViewType,
  setOverviewViewType,
  customerOverviewSearch,
  setCustomerOverviewSearch,
  vendorOverviewSearch,
  setVendorOverviewSearch,
  customerOverview,
  vendorOverview,
  customerOverviewLoading,
  vendorOverviewLoading,
  onCustomerOpen
}) {
  const isCustomerView = overviewViewType === 'customers'
  const overviewLoading = isCustomerView ? customerOverviewLoading : vendorOverviewLoading
  const overviewItems = isCustomerView ? customerOverview : vendorOverview
  const searchValue = isCustomerView ? customerOverviewSearch : vendorOverviewSearch
  const setSearchValue = isCustomerView ? setCustomerOverviewSearch : setVendorOverviewSearch

  return (
    <div className="dashboard-mobile-view">
      <div className="dashboard-mobile-metrics dashboard-mobile-metrics--accounts">
        <MetricCard
          label="Total Customers"
          value={totalCustomers || 0}
          caption="Active accounts"
          icon={Users}
          color="#60a5fa"
          loading={summaryLoading}
        />
        <MetricCard
          label="Total Vendors"
          value={totalVendors || 0}
          caption="Active vendors"
          icon={Store}
          color="#34d399"
          loading={summaryLoading}
        />
      </div>

      <MetricSection title="Sales">
        <MetricCard
          label="Last 30 Days Sales Invoices"
          value={`$${formatMoney(monthlySalesInvoices, 0)}`}
          caption="Total sales"
          icon={FileText}
          color="#34d399"
          featured
          loading={summaryLoading}
        />
        <MetricCard
          label="Last 30 Days Sales Payments"
          value={`$${formatMoney(monthlySalesPayments, 0)}`}
          caption="Total received"
          icon={HandCoins}
          color="#c084fc"
          loading={summaryLoading}
        />
        <MetricCard
          label="Last 30 Days Sales Outstanding"
          value={`$${formatMoney(salesOutstanding, 0)}`}
          caption="Pending receivables"
          icon={BriefcaseBusiness}
          color="#c084fc"
          loading={summaryLoading}
        />
      </MetricSection>

      <MetricSection title="Purchase">
        <MetricCard
          label="Last 30 Days Purchase Invoices"
          value={`$${formatMoney(monthlyPurchaseInvoices, 0)}`}
          caption="Total value"
          icon={FileText}
          color="#60a5fa"
          featured
          loading={summaryLoading}
        />
        <MetricCard
          label="Last 30 Days Purchase Payments"
          value={`$${formatMoney(monthlyPurchasePayments, 0)}`}
          caption="Total paid"
          icon={HandCoins}
          color="#f87171"
          loading={summaryLoading}
        />
        <MetricCard
          label="Last 30 Days Purchase Outstanding"
          value={`$${formatMoney(purchaseOutstanding, 0)}`}
          caption="Pending payables"
          icon={AlertCircle}
          color="#f87171"
          loading={summaryLoading}
        />
      </MetricSection>

      {isAdmin && (
        <section className="dashboard-mobile-section" aria-label="Record totals">
          <div className="dashboard-mobile-section__heading">
            <h2>Records</h2>
          </div>
          <div className="dashboard-mobile-metrics">
            <MetricCard label="Total Sale Invoice Rows" value={totalSaleInvoiceRows} caption="All records" icon={FileText} color="#60a5fa" loading={summaryLoading} />
            <MetricCard label="Total Sale Payment Rows" value={totalSalePaymentRows} caption="All records" icon={FileText} color="#60a5fa" loading={summaryLoading} />
            <MetricCard label="Total Purchase Invoice Rows" value={totalPurchaseInvoiceRows} caption="All records" icon={FileText} color="#60a5fa" loading={summaryLoading} />
            <MetricCard label="Total Purchase Payment Rows" value={totalPurchasePaymentRows} caption="All records" icon={FileText} color="#60a5fa" loading={summaryLoading} />
          </div>
        </section>
      )}

      <section className="dashboard-mobile-overview" aria-label="Customer and vendor overview">
        <div className="dashboard-mobile-overview__tabs" role="group" aria-label="Overview type">
          <button
            type="button"
            aria-pressed={isCustomerView}
            className={isCustomerView ? 'is-active' : ''}
            onClick={() => setOverviewViewType('customers')}
          >
            Customers
          </button>
          <button
            type="button"
            aria-pressed={!isCustomerView}
            className={!isCustomerView ? 'is-active' : ''}
            onClick={() => setOverviewViewType('vendors')}
          >
            Vendors
          </button>
        </div>

        <label className="dashboard-mobile-overview__search">
          <Search size={17} aria-hidden="true" />
          <span className="dashboard-mobile-visually-hidden">
            Search {isCustomerView ? 'customers' : 'vendors'}
          </span>
          <input
            type="search"
            placeholder={`Search ${isCustomerView ? 'customers' : 'vendors'}...`}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </label>

        <div className="dashboard-mobile-overview__list" aria-busy={overviewLoading}>
          {overviewLoading ? (
            <div className="dashboard-mobile-overview__state" role="status">Loading {isCustomerView ? 'customers' : 'vendors'}…</div>
          ) : overviewItems.length === 0 ? (
            <div className="dashboard-mobile-overview__state" role="status">No data is available.</div>
          ) : (
            overviewItems.map((item) => (
              <OverviewCard
                key={String(isCustomerView ? item.customerId : item.vendorId)}
                item={item}
                type={overviewViewType}
                formatMoney={formatMoney}
                onCustomerOpen={isCustomerView ? () => onCustomerOpen(item) : undefined}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
