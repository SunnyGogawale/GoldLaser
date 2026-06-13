function EmptyDataCard({ message = 'No data is available.' }) {
  return (
    <div className="empty-data-card" role="status">
      <div className="empty-data-card__title">{message}</div>
    </div>
  )
}

export default EmptyDataCard
