import React from 'react'
import { Skeleton } from 'boneyard-js/react'
import './SkeletonUI.css'

export function LoadingSkeleton({ loading, fallback, children, name }) {
  return <Skeleton name={name} loading={loading} fallback={fallback} animate="shimmer">{children}</Skeleton>
}

export function SkeletonShape({ width = '100%', height = 12, radius = 4, style = {} }) {
  return <span aria-hidden="true" className="ui-skeleton-shape" style={{ width, height, borderRadius: radius, ...style }} />
}

export function SkeletonTable({ columns, rows = 5, minWidth = '100%' }) {
  return (
    <div className="ui-skeleton-table-wrap" aria-hidden="true">
      <table className="ui-skeleton-table" style={{ minWidth }}>
        <colgroup>{columns.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead><tr>{columns.map((_, index) => <th key={index}><SkeletonShape width="68%" height={10} /></th>)}</tr></thead>
        <tbody>{Array.from({ length: rows }, (_, rowIndex) => (
          <tr key={rowIndex}>{columns.map((_, columnIndex) => <td key={columnIndex}><SkeletonShape width={`${55 + ((rowIndex + columnIndex) % 4) * 10}%`} /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export function SkeletonTableRows({ columns = 5, rows = 5 }) {
  const columnCount = Array.isArray(columns) ? columns.length : columns
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr className="ui-skeleton-row" key={rowIndex} aria-hidden="true">
      {Array.from({ length: columnCount }, (_, columnIndex) => (
        <td key={columnIndex} style={Array.isArray(columns) ? { width: columns[columnIndex] } : undefined}>
          <SkeletonShape width={`${55 + ((rowIndex + columnIndex) % 4) * 10}%`} />
        </td>
      ))}
    </tr>
  ))
}

export function SkeletonOptionRows({ rows = 3 }) {
  return Array.from({ length: rows }, (_, index) => (
    <li className="ui-skeleton-option-row" key={index} aria-hidden="true">
      <SkeletonShape width={`${58 + (index % 3) * 12}%`} height={14} />
    </li>
  ))
}

export function SkeletonGridRows({ columns, rows = 4 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="ui-skeleton-grid-row" key={rowIndex} style={{ gridTemplateColumns: columns }}>
          {columns.split(' ').map((_, columnIndex) => <SkeletonShape key={columnIndex} width={`${58 + ((rowIndex + columnIndex) % 3) * 10}%`} />)}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCardList({ rows = 4 }) {
  return (
    <div className="ui-skeleton-card-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="ui-skeleton-card" key={index}>
          <div className="ui-skeleton-card-heading"><SkeletonShape width="38%" height={16} /><SkeletonShape width={32} height={28} /></div>
          <SkeletonShape width="72%" />
          <SkeletonShape width="54%" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonMetricGrid({ cards = 8 }) {
  return (
    <div className="ui-skeleton-metric-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => (
        <div className="ui-skeleton-metric-card" key={index}>
          <SkeletonShape width="60%" height={12} />
          <SkeletonShape width="45%" height={30} style={{ marginTop: '0.65rem' }} />
          <SkeletonShape width="55%" height={11} style={{ marginTop: '0.45rem' }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonFormGrid({ fields = 3 }) {
  return (
    <div className="ui-skeleton-form-grid" aria-hidden="true">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index}>
          <SkeletonShape width="36%" height={10} />
          <SkeletonShape width="100%" height={36} style={{ marginTop: '0.45rem' }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonDetail({ rows = 4 }) {
  return (
    <div className="ui-skeleton-detail" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="ui-skeleton-detail-row" key={index}>
          <SkeletonShape width="28%" />
          <SkeletonShape width={`${45 + (index % 3) * 12}%`} />
        </div>
      ))}
    </div>
  )
}