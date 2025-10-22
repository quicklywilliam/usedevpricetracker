import React from 'react';
import VehicleListingTabs from './VehicleListingTabs';
import { findNewListings, findListingsWithPriceChanges } from '../services/dataLoader';
import './ModelListingsView.css';

export default function ModelListingsView({ data, model }) {
  if (!data || data.length === 0 || !model) {
    return null;
  }

  // Get latest data for "all" tab
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

  // Get new listings and price-changed listings, filter for this model
  const newListings = findNewListings(data).filter(
    listing => `${listing.make} ${listing.model}` === model
  );
  const priceChangedListings = findListingsWithPriceChanges(data).filter(
    listing => `${listing.make} ${listing.model}` === model
  );

  return (
    <div className="model-listings-view">
      <VehicleListingTabs
        newListings={newListings}
        changedListings={priceChangedListings}
        allListings={allListings}
        showModel={false}
      />
    </div>
  );
}
