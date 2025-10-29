import React, { useState, useEffect } from 'react';
import ListingsTable from './ListingsTable';
import './VehicleListingTabs.css';

export default function VehicleListingTabs({
  newListings,
  changedListings,
  soldListings = null,
  allListings = null,
  showModel = false,
  sourceFilter = null
}) {
  const [activeTab, setActiveTab] = useState('new');

  // Load tab from URL on mount
  useEffect(() => {
    const url = new URL(window.location);
    const tab = url.searchParams.get('tab');
    if (tab === 'new' || tab === 'changed' || tab === 'sold' || (allListings && tab === 'all')) {
      setActiveTab(tab);
    }
  }, [allListings, soldListings]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const tab = url.searchParams.get('tab') || 'new';
      setActiveTab(tab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const url = new URL(window.location);
    if (tab === 'new') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.pushState({}, '', url);
  };

  // Get the listings to display based on active tab
  let listings, title;
  if (activeTab === 'new') {
    listings = newListings;
    title = 'New Listings';
  } else if (activeTab === 'changed') {
    listings = changedListings;
    title = 'Price Changes';
  } else if (activeTab === 'sold' && soldListings) {
    listings = soldListings;
    title = 'Sold Vehicles';
  } else if (activeTab === 'all' && allListings) {
    listings = allListings;
    title = 'All Listings';
  }

  return (
    <div className="vehicle-listing-tabs">
      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => handleTabChange('new')}
          >
            New ({newListings.length})
          </button>
          <button
            className={`tab ${activeTab === 'changed' ? 'active' : ''}`}
            onClick={() => handleTabChange('changed')}
          >
            Price Changes ({changedListings.length})
          </button>
          {soldListings && (
            <button
              className={`tab ${activeTab === 'sold' ? 'active' : ''}`}
              onClick={() => handleTabChange('sold')}
            >
              Sold ({soldListings.length})
            </button>
          )}
          {allListings && (
            <button
              className={`tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => handleTabChange('all')}
            >
              All Listings ({allListings.length})
            </button>
          )}
        </div>
        {sourceFilter && (
          <div className="tabs-filter">
            {sourceFilter}
          </div>
        )}
      </div>
      <ListingsTable
        listings={listings}
        title={title}
        showPriceChange={activeTab === 'changed'}
        showModel={showModel}
        showStatus={activeTab === 'sold'}
        showDaysOnMarket={true}
        emptyMessage={
          activeTab === 'new' ? 'No new listings found' :
          activeTab === 'changed' ? 'No price changes found' :
          activeTab === 'sold' ? 'No sold vehicles found' :
          'No listings found'
        }
      />
    </div>
  );
}
