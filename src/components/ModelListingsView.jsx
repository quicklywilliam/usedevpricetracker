import React, { useState, useEffect } from 'react';
import ListingsTable from './ListingsTable';
import { findNewListings } from '../services/dataLoader';
import './ModelListingsView.css';

export default function ModelListingsView({ data, model }) {
  const [activeTab, setActiveTab] = useState('all');

  // Load tab from URL on mount
  useEffect(() => {
    const url = new URL(window.location);
    const tab = url.searchParams.get('tab');
    if (tab === 'new' || tab === 'all') {
      setActiveTab(tab);
    }
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const tab = url.searchParams.get('tab') || 'all';
      setActiveTab(tab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (!data || data.length === 0 || !model) {
    return null;
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const url = new URL(window.location);
    if (tab === 'all') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.pushState({}, '', url);
  };

  // Get latest data only for "all" tab
  const latestDate = data
    .map(d => d.scraped_at)
    .sort()
    .reverse()[0]
    ?.split('T')[0];

  const latestData = data.filter(
    d => d.scraped_at.startsWith(latestDate)
  );

  const allListings = [];
  latestData.forEach(sourceData => {
    sourceData.listings.forEach(listing => {
      if (`${listing.make} ${listing.model}` === model) {
        allListings.push({ ...listing, source: sourceData.source });
      }
    });
  });

  // Sort by price
  allListings.sort((a, b) => a.price - b.price);

  // Get new listings and filter for this model
  const newListings = findNewListings(data).filter(
    listing => `${listing.make} ${listing.model}` === model
  );

  const listings = activeTab === 'all' ? allListings : newListings;
  const title = activeTab === 'all' ? 'All Listings' : 'New Listings';

  return (
    <div className="model-listings-view">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => handleTabChange('all')}
        >
          All Listings ({allListings.length})
        </button>
        <button
          className={`tab ${activeTab === 'new' ? 'active' : ''}`}
          onClick={() => handleTabChange('new')}
        >
          New Listings ({newListings.length})
        </button>
      </div>
      <ListingsTable listings={listings} title={title} />
    </div>
  );
}
