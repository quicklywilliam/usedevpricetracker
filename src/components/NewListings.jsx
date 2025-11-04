import React, { useState, useEffect } from 'react';
import VehicleListingTabs from './VehicleListingTabs';
import { findNewListings, findListingsWithPriceChanges, findSoldListings, calculateDaysOnMarket } from '../services/dataLoader';
import './NewListings.css';

export default function NewListings({ data, selectedDate, loading = false }) {
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
    if (loading) {
      return (
        <div className="new-listings">
          <div className="loading">Loading new listings...</div>
        </div>
      );
    }
    return null;
  }

  const newListings = findNewListings(data, selectedDate);
  const priceChangedListings = findListingsWithPriceChanges(data, selectedDate);
  const soldListings = findSoldListings(data, selectedDate);

  // Combine new, price-changed, and sold listings for source filtering
  const allListings = [...newListings, ...priceChangedListings, ...soldListings];

  if (allListings.length === 0) {
    return null;
  }

  // Get unique sources
  const sources = [...new Set(allListings.map(l => l.source))].sort();

  // Filter listings by source and add days on market
  const filteredNewListings = (selectedSource === 'all'
    ? newListings
    : newListings.filter(l => l.source === selectedSource)
  ).map(listing => ({
    ...listing,
    daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
  }));

  const filteredChangedListings = (selectedSource === 'all'
    ? priceChangedListings
    : priceChangedListings.filter(l => l.source === selectedSource)
  ).map(listing => ({
    ...listing,
    daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
  }));

  const filteredSoldListings = (selectedSource === 'all'
    ? soldListings
    : soldListings.filter(l => l.source === selectedSource)
  ).map(listing => ({
    ...listing,
    daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
  }));

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

  const sourceFilterElement = (
    <div className="source-filter">
      <label className="source-filter__label" htmlFor="source-select">
        Source
      </label>
      <div className="source-filter__control">
        <select
          id="source-select"
          value={selectedSource}
          onChange={(e) => handleSourceChange(e.target.value)}
        >
          <option value="all">All Sources</option>
          {sources.map(source => {
            const displayName = source.charAt(0).toUpperCase() + source.slice(1);
            return (
              <option key={source} value={source}>
                {displayName}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );

  return (
    <div className="new-listings">
      <VehicleListingTabs
        newListings={filteredNewListings}
        changedListings={filteredChangedListings}
        soldListings={filteredSoldListings}
        showModel={true}
        sourceFilter={sourceFilterElement}
      />
    </div>
  );
}
