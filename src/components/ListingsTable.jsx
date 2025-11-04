import React from 'react';
import './ListingsTable.css';

export default function ListingsTable({
  listings,
  title = 'Current Listings',
  emptyMessage = 'No listings found',
  showModel = false,
  showPriceChange = false,
  showDaysOnMarket = false,
  showStatus = false
}) {
  if (!listings || listings.length === 0) {
    return null;
  }

  const sourceColors = {
    'mock-source': 'source-mock',
    'autotrader': 'source-autotrader',
    'carmax': 'source-carmax',
    'carvana': 'source-carvana',
    'plattauto': 'source-plattauto'
  };

  return (
      <div className="listings-table__surface">
        <table>
          <thead>
            <tr>
              {showModel && (
                <th className="col-vehicle">Vehicle</th>
              )}
              <th className="col-price">Price</th>
              {showPriceChange && <th className="col-change">Change</th>}
              <th>Trim</th>
              <th>Mileage</th>
              {showStatus && <th className="col-status">Status</th>}
              {showDaysOnMarket && <th className="col-days">On Market</th>}
              <th className="col-link">Listing</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing, idx) => (
              <tr key={idx}>
              {showModel && (
                <>
                  <td className="col-vehicle" data-label="Vehicle">{listing.make} {listing.model}</td>
                </>
              )}
                <td className="col-price" data-label="Price">
                  <span className="price">${listing.price.toLocaleString()}</span>
                </td>
                {showPriceChange && (
                  <td className="col-change" data-label="Change">
                    {listing.priceChange !== undefined ? (
                      <span className={`price-change ${listing.priceChange > 0 ? 'price-increase' : 'price-decrease'}`}>
                        {listing.priceChange > 0 ? '↑' : '↓'} ${Math.abs(listing.priceChange).toLocaleString()}
                      </span>
                    ) : (
                      <span className="price-change-new">NEW</span>
                    )}
                  </td>
                )}
                <td data-label="Trim">{listing.trim || '-'}</td>
                <td>{listing.mileage.toLocaleString()} mi</td>
                {showStatus && (
                  <td className="col-status" data-label="Status">
                    <span className={`status-badge ${listing.purchase_status === 'selling' ? 'status-selling' : 'status-sold'}`}>
                      {listing.displayStatus || 'Sold'}
                    </span>
                  </td>
                )}
                {showDaysOnMarket && (
                  <td className="col-days" data-label="Days on Market">
                    {listing.daysOnMarket !== undefined && listing.daysOnMarket !== null
                      ? `${listing.daysOnMarket} ${listing.daysOnMarket === 1 ? 'day' : 'days'}`
                      : '-'}
                  </td>
                )}
                <td className="col-link" data-label="Link">
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="listings-table__link"
                  >
                    <span className={`source-badge ${sourceColors[listing.source] || 'source-default'}`}>
                        {listing.source}
                      </span><span aria-hidden="true"> ›</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}
