import { useState } from 'react'
import { MoreVertical, Plus, Search, UploadCloud } from 'lucide-react'
import EmptyDataCard from '../../../../src/components/EmptyDataCard'
import { SkeletonCardList } from '../../../../src/components/SkeletonUI'
import '../../styles/payment-mobile.css'

function PaymentMobileCard({
  payment,
  getCustomerLabel,
  getAmountLabel,
  formatDate,
  customerLabel,
  onActions
}) {
  const description = String(payment.description || '').trim()

  return (
    <article className="payment-mobile-card">
      <div className="payment-mobile-card__top">
        <div className="payment-mobile-card__number">
          <span className="payment-mobile-card__label">Payment No</span>
          <strong>{payment.paymentNumber || '-'}</strong>
        </div>
        <div className="payment-mobile-card__date">
          <span className="payment-mobile-card__label">Date</span>
          <span>{formatDate(payment.paymentDate)}</span>
        </div>
        <button
          type="button"
          className="payment-mobile-card__actions"
          aria-label={`Actions for payment ${payment.paymentNumber || ''}`}
          title="Actions"
          onClick={(event) => onActions(payment, event)}
        >
          <MoreVertical size={19} aria-hidden="true" />
        </button>
      </div>

      <div className="payment-mobile-card__customer">
        <span className="payment-mobile-card__label">{customerLabel}</span>
        <strong>{getCustomerLabel(payment) || '-'}</strong>
      </div>

      <div className="payment-mobile-card__amount">
        <span className="payment-mobile-card__label">Amount</span>
        <strong>{getAmountLabel(payment)}</strong>
      </div>

      {description && (
        <div className="payment-mobile-card__description">
          <span className="payment-mobile-card__label">Description</span>
          <p>{description}</p>
        </div>
      )}
    </article>
  )
}

export default function PaymentMobile({
  payments,
  loading,
  loadingDisabled,
  currentPage,
  totalPages,
  isAdmin,
  onAddPayment,
  onUploadCsv,
  onActions,
  onPageChange,
  searchQuery,
  setSearchQuery,
  getCustomerLabel,
  getAmountLabel,
  formatDate,
  title = 'Sales Payment',
  listTitle = 'Payment List',
  customerLabel = 'Customer Name',
  searchPlaceholder = 'Search any payment field...'
}) {
  const [searchFocused, setSearchFocused] = useState(false)

  return (
    <section className="payment-mobile-view" aria-labelledby="payment-mobile-title">
      <div className="payment-mobile-view__header">
        <h1 id="payment-mobile-title">{title}</h1>
        <div className="payment-mobile-view__header-actions">
          {isAdmin && (
            <button
              type="button"
              className="payment-mobile-view__upload"
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
            className="payment-mobile-view__add"
            onClick={onAddPayment}
            disabled={loadingDisabled}
            aria-label="Add Payment"
            title="Add Payment"
          >
            <Plus size={23} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className={`payment-mobile-view__search${searchFocused ? ' is-focused' : ''}`}>
        <Search size={20} aria-hidden="true" />
        <span className="payment-mobile-visually-hidden">Search any payment field</span>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <h2 className="payment-mobile-view__list-title">{listTitle}</h2>

      {loading ? (
        <SkeletonCardList rows={4} />
      ) : payments.length === 0 ? (
        <EmptyDataCard />
      ) : (
        <div className="payment-mobile-view__list">
          {payments.map((payment) => (
            <PaymentMobileCard
              key={payment._id}
              payment={payment}
              getCustomerLabel={getCustomerLabel}
              getAmountLabel={getAmountLabel}
              formatDate={formatDate}
              customerLabel={customerLabel}
              onActions={onActions}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <nav className="payment-mobile-view__pagination" aria-label="Payment pages">
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
