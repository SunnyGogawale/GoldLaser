import { useState } from 'react'
import { ChevronLeft, ChevronRight, MoreVertical, Plus, Search } from 'lucide-react'
import EmptyDataCard from '../../../../src/components/EmptyDataCard'
import { SkeletonCardList } from '../../../../src/components/SkeletonUI'
import '../../styles/customer-mobile.css'

function CustomerMobileCard({ customer, customColumns, formatMoney, onActions }) {
  const customerName = customer.customerName ||
    `${customer.firstName || ''} ${customer.lastName || ''}`.replace(/\s+/g, ' ').trim()
  const companyName = customer.companyName || ''
  const mobile = customer.contactNumber || ''
  const email = customer.email || ''
  const outstandingAmount = customer.outstanding?.outstanding || 0
  const outstanding = formatMoney(Math.abs(Number(outstandingAmount) || 0))
  const initials = (companyName || customerName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()

  return (
    <article className="customer-mobile-card">
      <div className="customer-mobile-card__header">
        <span className="customer-mobile-card__avatar" aria-hidden="true">{initials}</span>
        <div className="customer-mobile-card__company">
          <span className="customer-mobile-card__label">Company Name</span>
          <strong>{companyName || '-'}</strong>
        </div>
        <button
          type="button"
          className="customer-mobile-card__actions"
          aria-label={`Actions for ${customerName || companyName || 'customer'}`}
          title="Actions"
          onClick={(event) => onActions(customer, event)}
        >
          <MoreVertical size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="customer-mobile-card__details">
        <div className="customer-mobile-card__detail">
          <span className="customer-mobile-card__label">Customer Name</span>
          <span className="customer-mobile-card__value">{customerName || '-'}</span>
        </div>
        <div className="customer-mobile-card__detail">
          <span className="customer-mobile-card__label">Mobile No</span>
          <span className="customer-mobile-card__value">{mobile || '-'}</span>
        </div>
        <div className="customer-mobile-card__detail customer-mobile-card__detail--email">
          <span className="customer-mobile-card__label">Email</span>
          <span className="customer-mobile-card__value">{email || '-'}</span>
        </div>
        {customColumns.map((columnName) => {
          const value = customer.customFields?.[columnName]
          if (!value) return null
          return (
            <div className="customer-mobile-card__detail customer-mobile-card__detail--custom" key={columnName}>
              <span className="customer-mobile-card__label">{columnName}</span>
              <span className="customer-mobile-card__value">{value}</span>
            </div>
          )
        })}
      </div>

      <div className="customer-mobile-card__outstanding">
        <span className="customer-mobile-card__label">Outstanding</span>
        <strong className={outstandingAmount < 0 ? 'is-credit' : outstandingAmount > 0 ? 'is-debit' : ''}>
          ${outstanding}
        </strong>
      </div>
    </article>
  )
}

export default function CustomerMobile({
  customers,
  customColumns,
  formatMoney,
  loading,
  loadingDisabled,
  currentPage,
  totalPages,
  onAddCustomer,
  onActions,
  onPageChange,
  searchQuery,
  setSearchQuery
}) {
  const [searchFocused, setSearchFocused] = useState(false)

  return (
    <section className="customer-mobile-view" aria-labelledby="customer-mobile-title">
      <h1 id="customer-mobile-title" className="customer-mobile-view__title">Customer Masters</h1>
      <button
        type="button"
        className="customer-mobile-view__add"
        onClick={onAddCustomer}
        disabled={loadingDisabled}
      >
        <Plus size={18} aria-hidden="true" />
        <span>Add Customer</span>
      </button>

      <label className={`customer-mobile-view__search${searchFocused ? ' is-focused' : ''}`}>
        <Search size={18} aria-hidden="true" />
        <span className="customer-mobile-visually-hidden">Search any customer field</span>
        <input
          type="search"
          placeholder="Search any customer field..."
          value={searchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <div className="customer-mobile-view__list-heading">
        <h2>Customer List</h2>
        <span>{customers.length} {customers.length === 1 ? 'customer' : 'customers'}</span>
      </div>

      {loading ? (
        <SkeletonCardList rows={4} />
      ) : customers.length === 0 ? (
        <EmptyDataCard />
      ) : (
        <div className="customer-mobile-view__list">
          {customers.map((customer) => (
            <CustomerMobileCard
              key={customer._id}
              customer={customer}
              customColumns={customColumns}
              formatMoney={formatMoney}
              onActions={onActions}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <nav className="customer-mobile-view__pagination" aria-label="Customer pages">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={17} aria-hidden="true" />
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  )
}
