import React, { useState, useEffect } from 'react';
import ListingsTable from './ListingsTable';
import { findNewListings, findListingsWithPriceChanges } from '../services/dataLoader';
import './NewListings.css';

export default function NewListings({ data }) {
  const [selectedSource, setSelectedSource] = useState('all');

  // Load source filter from URL on mount
  useEffect(() => {
    const url = new URL(window.location);
    const source = url.searchParams.get('source');
    if (source) {
      setSelectedSource(source);
    }
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const source = url.searchParams.get('source') || 'all';
      setSelectedSource(source);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (!data || data.length === 0) {
    return null;
  }

  const newListings = findNewListings(data);
  const priceChangedListings = findListingsWithPriceChanges(data);

  // Combine new and price-changed listings
  const allListings = [...newListings, ...priceChangedListings];

  if (allListings.length === 0) {
    return null;
  }

  // Get unique sources
  const sources = [...new Set(allListings.map(l => l.source))].sort();

  // Filter listings by source
  const filteredListings = selectedSource === 'all'
    ? allListings
    : allListings.filter(l => l.source === selectedSource);

  const handleSourceChange = (source) => {
    setSelectedSource(source);
    const url = new URL(window.location);
    if (source === 'all') {
      url.searchParams.delete('source');
    } else {
      url.searchParams.set('source', source);
    }
    window.history.pushState({}, '', url);
  };

  return (
    <div className="new-listings">
      <div className="new-listings-header">
        <div>
          <h2>New & Changed Listings</h2>
          <p className="subtitle">Recently added vehicles and price changes from the latest scrape</p>
        </div>
        <div className="source-filter">
          <label htmlFor="source-select">Filter by source:</label>
          <select
            id="source-select"
            value={selectedSource}
            onChange={(e) => handleSourceChange(e.target.value)}
          >
            <option value="all">All Sources ({allListings.length})</option>
            {sources.map(source => {
              const count = allListings.filter(l => l.source === source).length;
              const displayName = source.charAt(0).toUpperCase() + source.slice(1);
              return (
                <option key={source} value={source}>
                  {displayName} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <ListingsTable
        listings={filteredListings}
        title=""
        emptyMessage="No new or changed listings found"
        showModel={true}
        showPriceChange={true}
      />
    </div>
  );
}
