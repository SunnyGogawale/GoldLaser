import { useState } from 'react'
import { MoreVertical, Plus, Search, UploadCloud } from 'lucide-react'
import EmptyDataCard from '../../../../src/components/EmptyDataCard'
import { SkeletonCardList } from '../../../../src/components/SkeletonUI'
import '../../styles/invoice-mobile.css'

function InvoiceMobileCard({
  invoice,
  getClientDisplayLabel,
  getInvoiceListDescription,
  formatDate,
  clientLabel,
  onActions
}) {
  const amount = Number(invoice.totalAmount) || 0
  const description = getInvoiceListDescription(invoice)

  return (
    <article className="invoice-mobile-card">
      <div className="invoice-mobile-card__top">
        <div className="invoice-mobile-card__number">
          <span className="invoice-mobile-card__label">INV No</span>
          <strong>{invoice.invoiceNumber || '-'}</strong>
        </div>
        <div className="invoice-mobile-card__date">
          <span className="invoice-mobile-card__label">Date</span>
          <span>{formatDate(invoice.invoiceDate)}</span>
        </div>
        <div className="invoice-mobile-card__actions">
          <button
            type="button"
            className="invoice-mobile-card__icon-button"
            aria-label={`Actions for invoice ${invoice.invoiceNumber || ''}`}
            title="Actions"
            onClick={(event) => onActions(invoice, event)}
          >
            <MoreVertical size={19} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="invoice-mobile-card__customer">
        <span className="invoice-mobile-card__label">{clientLabel}</span>
        <strong>{getClientDisplayLabel(invoice.vendorId) || '-'}</strong>
      </div>

      <div className="invoice-mobile-card__amount">
        <span className="invoice-mobile-card__label">Amount</span>
        <strong>${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      </div>

      {description && (
        <div className="invoice-mobile-card__description">
          <span className="invoice-mobile-card__label">Description</span>
          <p>{description}</p>
        </div>
      )}
    </article>
  )
}

export default function InvoiceMobile({
  invoices,
  loading,
  loadingDisabled,
  currentPage,
  totalPages,
  isAdmin,
  showCsvUpload = isAdmin,
  onAddInvoice,
  onUploadCsv,
  onActions,
  onPageChange,
  searchQuery,
  setSearchQuery,
  getClientDisplayLabel,
  getInvoiceListDescription,
  formatDate,
  title = 'Sales Invoice',
  listTitle = 'Invoice List',
  clientLabel = 'Customer Name',
  searchPlaceholder = 'Search any invoice field...'
}) {
  const [searchFocused, setSearchFocused] = useState(false)

  return (
    <section className="invoice-mobile-view" aria-labelledby="invoice-mobile-title">
      <div className="invoice-mobile-view__header">
        <h1 id="invoice-mobile-title">{title}</h1>
        <div className="invoice-mobile-view__header-actions">
          {showCsvUpload && isAdmin && (
            <button
              type="button"
              className="invoice-mobile-view__upload"
              onClick={onUploadCsv}
              disabled={loadingDisabled}
              aria-label="Upload CSV"
              title="Upload CSV"
            >
              <UploadCloud size={20} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="invoice-mobile-view__add"
            onClick={onAddInvoice}
            disabled={loadingDisabled}
            aria-label="Add Invoice"
            title="Add Invoice"
          >
            <Plus size={23} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className={`invoice-mobile-view__search${searchFocused ? ' is-focused' : ''}`}>
        <Search size={20} aria-hidden="true" />
        <span className="invoice-mobile-visually-hidden">Search any invoice field</span>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <h2 className="invoice-mobile-view__list-title">{listTitle}</h2>

      {loading ? (
        <SkeletonCardList rows={4} />
      ) : invoices.length === 0 ? (
        <EmptyDataCard />
      ) : (
        <div className="invoice-mobile-view__list">
          {invoices.map((invoice) => (
            <InvoiceMobileCard
              key={invoice._id}
              invoice={invoice}
              getClientDisplayLabel={getClientDisplayLabel}
              getInvoiceListDescription={getInvoiceListDescription}
              formatDate={formatDate}
              clientLabel={clientLabel}
              onActions={onActions}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <nav className="invoice-mobile-view__pagination" aria-label="Invoice pages">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  )
}
