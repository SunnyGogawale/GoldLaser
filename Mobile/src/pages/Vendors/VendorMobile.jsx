import { useState } from 'react'
import { ChevronLeft, ChevronRight, MoreVertical, Plus, Search } from 'lucide-react'
import EmptyDataCard from '../../../../src/components/EmptyDataCard'
import { SkeletonCardList } from '../../../../src/components/SkeletonUI'
import '../../styles/vendor-mobile.css'

function VendorMobileCard({ vendor, customColumns, formatMoney, onActions }) {
  const vendorName = vendor.vendorName ||
    `${vendor.firstName || ''} ${vendor.lastName || ''}`.replace(/\s+/g, ' ').trim()
  const companyName = vendor.companyName || ''
  const mobile = vendor.contactNumber || ''
  const email = vendor.email || ''
  const outstandingAmount = vendor.outstanding?.outstanding || 0
  const outstanding = formatMoney(Math.abs(Number(outstandingAmount) || 0))
  const initials = (companyName || vendorName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()

  return (
    <article className="vendor-mobile-card">
      <div className="vendor-mobile-card__header">
        <span className="vendor-mobile-card__avatar" aria-hidden="true">{initials}</span>
        <div className="vendor-mobile-card__company">
          <span className="vendor-mobile-card__label">Company Name</span>
          <strong>{companyName || '-'}</strong>
        </div>
        <button
          type="button"
          className="vendor-mobile-card__actions"
          aria-label={`Actions for ${vendorName || companyName || 'vendor'}`}
          title="Actions"
          onClick={(event) => onActions(vendor, event)}
        >
          <MoreVertical size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="vendor-mobile-card__details">
        <div className="vendor-mobile-card__detail">
          <span className="vendor-mobile-card__label">Vendor Name</span>
          <span className="vendor-mobile-card__value">{vendorName || '-'}</span>
        </div>
        <div className="vendor-mobile-card__detail">
          <span className="vendor-mobile-card__label">Mobile No</span>
          <span className="vendor-mobile-card__value">{mobile || '-'}</span>
        </div>
        <div className="vendor-mobile-card__detail vendor-mobile-card__detail--email">
          <span className="vendor-mobile-card__label">Email</span>
          <span className="vendor-mobile-card__value">{email || '-'}</span>
        </div>
        {customColumns.map((columnName) => {
          const value = vendor.customFields?.[columnName]
          if (!value) return null
          return (
            <div className="vendor-mobile-card__detail vendor-mobile-card__detail--custom" key={columnName}>
              <span className="vendor-mobile-card__label">{columnName}</span>
              <span className="vendor-mobile-card__value">{value}</span>
            </div>
          )
        })}
      </div>

      <div className="vendor-mobile-card__outstanding">
        <span className="vendor-mobile-card__label">Outstanding</span>
        <strong className={outstandingAmount < 0 ? 'is-credit' : outstandingAmount > 0 ? 'is-debit' : ''}>
          ${outstanding}
        </strong>
      </div>
    </article>
  )
}

export default function VendorMobile({
  vendors,
  customColumns,
  formatMoney,
  loading,
  loadingDisabled,
  currentPage,
  totalPages,
  onAddVendor,
  onActions,
  onPageChange,
  searchQuery,
  setSearchQuery
}) {
  const [searchFocused, setSearchFocused] = useState(false)

  return (
    <section className="vendor-mobile-view" aria-labelledby="vendor-mobile-title">
      <h1 id="vendor-mobile-title" className="vendor-mobile-view__title">Vendor Masters</h1>
      <button
        type="button"
        className="vendor-mobile-view__add"
        onClick={onAddVendor}
        disabled={loadingDisabled}
      >
        <Plus size={16} aria-hidden="true" />
        <span>Add Vendor</span>
      </button>

      <label className={`vendor-mobile-view__search${searchFocused ? ' is-focused' : ''}`}>
        <Search size={18} aria-hidden="true" />
        <span className="vendor-mobile-visually-hidden">Search any vendor field</span>
        <input
          type="search"
          placeholder="Search any vendor field..."
          value={searchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <div className="vendor-mobile-view__list-heading">
        <h2>Vendor List</h2>
        <span>{vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'}</span>
      </div>

      {loading ? (
        <SkeletonCardList rows={4} />
      ) : vendors.length === 0 ? (
        <EmptyDataCard />
      ) : (
        <div className="vendor-mobile-view__list">
          {vendors.map((vendor) => (
            <VendorMobileCard
              key={vendor._id}
              vendor={vendor}
              customColumns={customColumns}
              formatMoney={formatMoney}
              onActions={onActions}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <nav className="vendor-mobile-view__pagination" aria-label="Vendor pages">
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
