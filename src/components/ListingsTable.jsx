import React from 'react';
import './ListingsTable.css';

export default function ListingsTable({ listings, title = "Current Listings", emptyMessage = "No listings found", showModel = false, showPriceChange = false }) {
  if (!listings || listings.length === 0) {
    return null;
  }

  const sourceColors = {
    'mock-source': 'source-mock',
    'carmax': 'source-carmax',
    'carvana': 'source-carvana',
    'plattauto': 'source-plattauto'
  };

  return (
    <div className="listings-table">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            {showModel && (
              <>
                <th>Make</th>
                <th>Model</th>
              </>
            )}
            <th>Year</th>
            <th>Trim</th>
            <th>Price</th>
            {showPriceChange && <th>Change</th>}
            <th>Mileage</th>
            <th>Location</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing, idx) => (
            <tr key={idx}>
              <td>
                <span className={`source-badge ${sourceColors[listing.source] || 'source-default'}`}>
                  {listing.source}
                </span>
              </td>
              {showModel && (
                <>
                  <td>{listing.make}</td>
                  <td>{listing.model}</td>
                </>
              )}
              <td>{listing.year}</td>
              <td>{listing.trim}</td>
              <td className="price">${listing.price.toLocaleString()}</td>
              {showPriceChange && (
                <td>
                  {listing.priceChange !== undefined ? (
                    <span className={`price-change ${listing.priceChange > 0 ? 'price-increase' : 'price-decrease'}`}>
                      {listing.priceChange > 0 ? '↑' : '↓'} ${Math.abs(listing.priceChange).toLocaleString()}
                    </span>
                  ) : (
                    <span className="price-change-new">NEW</span>
                  )}
                </td>
              )}
              <td>{listing.mileage.toLocaleString()} mi</td>
              <td>{listing.location}</td>
              <td>
                <a href={listing.url} target="_blank" rel="noopener noreferrer">
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
