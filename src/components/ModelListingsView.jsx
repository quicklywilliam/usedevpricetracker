import React, { useRef, useEffect, useState } from 'react';
import VehicleListingTabs from './VehicleListingTabs';
import { findNewListings, findListingsWithPriceChanges, findSoldListings, calculateDaysOnMarket } from '../services/dataLoader';
import './ModelListingsView.css';

export default function ModelListingsView({ data, model, selectedDate, loading = false, selectedDateXPosition = null }) {
  const wrapperRef = useRef(null);
  const [tailPosition, setTailPosition] = useState(null);

  useEffect(() => {
    if (selectedDateXPosition !== null && wrapperRef.current) {
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const relativeX = selectedDateXPosition - wrapperRect.left;
      setTailPosition(relativeX);
    } else {
      setTailPosition(null);
    }
  }, [selectedDateXPosition]);
  if (!data || data.length === 0 || !model) {
    if (loading) {
      return <div className="loading">Loading model details...</div>;
    }
    return null;
  }

  // Use selectedDate or fall back to latest date for "all" tab
  const dateToUse = selectedDate || data
    .map(d => d.scraped_at)
    .sort()
    .reverse()[0]
    ?.split('T')[0];

  const dateData = data.filter(
    d => d.scraped_at.startsWith(dateToUse)
  );

  const allListings = [];
  dateData.forEach(sourceData => {
    sourceData.listings.forEach(listing => {
      if (`${listing.make} ${listing.model}` === model) {
        allListings.push({ ...listing, source: sourceData.source });
      }
    });
  });

  // Sort by price
  allListings.sort((a, b) => a.price - b.price);

  // Add days on market to allListings
  allListings.forEach(listing => {
    listing.daysOnMarket = calculateDaysOnMarket(data, listing.id, listing.source, dateToUse, listing.purchase_status);
  });

  // Get new listings and price-changed listings, filter for this model, and add days on market
  const newListings = findNewListings(data, selectedDate)
    .filter(listing => `${listing.make} ${listing.model}` === model)
    .map(listing => ({
      ...listing,
      daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
    }));

  const priceChangedListings = findListingsWithPriceChanges(data, selectedDate)
    .filter(listing => `${listing.make} ${listing.model}` === model)
    .map(listing => ({
      ...listing,
      daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
    }));

  const soldListings = findSoldListings(data, selectedDate)
    .filter(listing => `${listing.make} ${listing.model}` === model)
    .map(listing => ({
      ...listing,
      daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
    }));

  return (
    <div className="model-listings-view" ref={wrapperRef}>
      {tailPosition !== null && (
        <div
          className="model-listings-view__tail"
          style={{ left: `${tailPosition}px` }}
        />
      )}
      <VehicleListingTabs
        newListings={newListings}
        changedListings={priceChangedListings}
        soldListings={soldListings}
        allListings={allListings}
        showModel={false}
      />
    </div>
  );
}
