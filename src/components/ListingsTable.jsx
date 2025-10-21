import React from 'react';
import './ListingsTable.css';

export default function ListingsTable({ data, model }) {
  if (!data || data.length === 0 || !model) {
    return null;
  }

  // Get latest data only
  const latestDate = data
    .map(d => d.scraped_at)
    .sort()
    .reverse()[0]
    ?.split('T')[0];

  const latestData = data.filter(
    d => d.scraped_at.startsWith(latestDate)
  );

  const listings = [];
  latestData.forEach(sourceData => {
    sourceData.listings.forEach(listing => {
      if (`${listing.make} ${listing.model}` === model) {
        listings.push({ ...listing, source: sourceData.source });
      }
    });
  });

  // Sort by price
  listings.sort((a, b) => a.price - b.price);

  const sourceColors = {
    'mock-source': 'source-mock',
    'carmax': 'source-carmax',
    'carvana': 'source-carvana',
    'plattauto': 'source-plattauto'
  };

  return (
    <div className="listings-table">
      <h2>Current Listings</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Year</th>
            <th>Trim</th>
            <th>Price</th>
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
              <td>{listing.year}</td>
              <td>{listing.trim}</td>
              <td className="price">${listing.price.toLocaleString()}</td>
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
