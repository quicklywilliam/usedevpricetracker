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
  const tabConfigs = [
    { id: 'new', label: 'New', count: newListings.length },
    { id: 'changed', label: 'Price Change', count: changedListings.length },
    soldListings ? { id: 'sold', label: 'Sold', count: soldListings.length } : null,
    allListings ? { id: 'all', label: 'All', count: allListings.length } : null
  ].filter(Boolean);

  if (activeTab === 'new') {
    listings = newListings;
    title = 'New';
  } else if (activeTab === 'changed') {
    listings = changedListings;
    title = 'Price Change';
  } else if (activeTab === 'sold' && soldListings) {
    listings = soldListings;
    title = 'Sold';
  } else if (activeTab === 'all' && allListings) {
    listings = allListings;
    title = 'All';
  }

  return (
    <div className="vehicle-listing-tabs">
      <div className="tabs-container">
        <div className="tabs">
          {tabConfigs.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
              aria-label={`${tab.label} (${tab.count})`}
            >
              <span className="tab__label">{tab.label}</span>
              <span className="tab__count" aria-hidden="true">
                ({tab.count})
              </span>
            </button>
          ))}
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
