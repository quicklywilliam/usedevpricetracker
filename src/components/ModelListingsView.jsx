import React, { useRef, useEffect, useState, useMemo } from 'react';
import VehicleListingTabs from './VehicleListingTabs';
import { findNewListings, findListingsWithPriceChanges, findSoldListings, calculateDaysOnMarket } from '../services/dataLoader';
import './ModelListingsView.css';

export default function ModelListingsView({ data, model, selectedDate, loading = false, selectedDateXPosition = null }) {
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);
  const yearDropdownRef = useRef(null);
  const [tailPosition, setTailPosition] = useState(null);
  const [selectedTrims, setSelectedTrims] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  useEffect(() => {
    if (selectedDateXPosition !== null && wrapperRef.current) {
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const relativeX = selectedDateXPosition - wrapperRect.left;
      setTailPosition(relativeX);
    } else {
      setTailPosition(null);
    }
  }, [selectedDateXPosition]);

  // Handle trim URL parameter (comma-separated list)
  useEffect(() => {
    const url = new URL(window.location);
    const trimParam = url.searchParams.get('trims');
    if (trimParam) {
      setSelectedTrims(trimParam.split(','));
    } else {
      setSelectedTrims([]);
    }
  }, []);

  // Handle year URL parameter (comma-separated list)
  useEffect(() => {
    const url = new URL(window.location);
    const yearParam = url.searchParams.get('years');
    if (yearParam) {
      setSelectedYears(yearParam.split(','));
    } else {
      setSelectedYears([]);
    }
  }, []);

  // Handle browser back/forward for trim
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const trimParam = url.searchParams.get('trims');
      setSelectedTrims(trimParam ? trimParam.split(',') : []);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle browser back/forward for year
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const yearParam = url.searchParams.get('years');
      setSelectedYears(yearParam ? yearParam.split(',') : []);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  // Close year dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target)) {
        setYearDropdownOpen(false);
      }
    };

    if (yearDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [yearDropdownOpen]);
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

  // Extract unique normalized trims from all listings
  const uniqueTrims = useMemo(() => {
    const trimSet = new Set();
    let hasUnknown = false;

    allListings.forEach(listing => {
      if (listing.normalized_trim) {
        trimSet.add(listing.normalized_trim);
      } else {
        hasUnknown = true;
      }
    });

    const trims = Array.from(trimSet).sort();

    // Add "Unknown" at the end if there are any non-normalized trims
    if (hasUnknown) {
      trims.push('Unknown');
    }

    return trims;
  }, [allListings.length, allListings.map(l => l.normalized_trim).join(',')]);

  // Extract unique years from all listings
  const uniqueYears = useMemo(() => {
    const yearSet = new Set();
    let hasUnknown = false;

    allListings.forEach(listing => {
      if (listing.year) {
        yearSet.add(listing.year.toString());
      } else {
        hasUnknown = true;
      }
    });

    const years = Array.from(yearSet).sort((a, b) => b - a); // Sort descending (newest first)

    // Add "Unknown" at the end if there are any listings without year
    if (hasUnknown) {
      years.push('Unknown');
    }

    return years;
  }, [allListings.length, allListings.map(l => l.year).join(',')]);

  // Filter function for trim (multi-select)
  const filterByTrim = (listings) => {
    if (selectedTrims.length === 0) {
      return listings;
    }
    return listings.filter(listing => {
      // Handle "Unknown" selection - matches listings without normalized_trim
      if (selectedTrims.includes('Unknown') && !listing.normalized_trim) {
        return true;
      }
      // Handle regular trim selection
      if (listing.normalized_trim && selectedTrims.includes(listing.normalized_trim)) {
        return true;
      }
      return false;
    });
  };

  // Filter function for year (multi-select)
  const filterByYear = (listings) => {
    if (selectedYears.length === 0) {
      return listings;
    }
    return listings.filter(listing => {
      // Handle "Unknown" selection - matches listings without year
      if (selectedYears.includes('Unknown') && !listing.year) {
        return true;
      }
      // Handle regular year selection
      if (listing.year && selectedYears.includes(listing.year.toString())) {
        return true;
      }
      return false;
    });
  };

  // Handler for trim selection (toggle checkbox)
  const handleTrimToggle = (trim) => {
    let newSelectedTrims;
    if (selectedTrims.includes(trim)) {
      // Remove trim from selection
      newSelectedTrims = selectedTrims.filter(t => t !== trim);
    } else {
      // Add trim to selection
      newSelectedTrims = [...selectedTrims, trim];
    }

    setSelectedTrims(newSelectedTrims);

    const url = new URL(window.location);
    if (newSelectedTrims.length === 0) {
      url.searchParams.delete('trims');
    } else {
      url.searchParams.set('trims', newSelectedTrims.join(','));
    }
    window.history.pushState({}, '', url);
  };

  // Handler for clear all
  const handleClearAllTrims = () => {
    setSelectedTrims([]);
    const url = new URL(window.location);
    url.searchParams.delete('trims');
    window.history.pushState({}, '', url);
  };

  // Handler for year selection (toggle checkbox)
  const handleYearToggle = (year) => {
    let newSelectedYears;
    if (selectedYears.includes(year)) {
      // Remove year from selection
      newSelectedYears = selectedYears.filter(y => y !== year);
    } else {
      // Add year to selection
      newSelectedYears = [...selectedYears, year];
    }

    setSelectedYears(newSelectedYears);

    const url = new URL(window.location);
    if (newSelectedYears.length === 0) {
      url.searchParams.delete('years');
    } else {
      url.searchParams.set('years', newSelectedYears.join(','));
    }
    window.history.pushState({}, '', url);
  };

  // Handler for clear all years
  const handleClearAllYears = () => {
    setSelectedYears([]);
    const url = new URL(window.location);
    url.searchParams.delete('years');
    window.history.pushState({}, '', url);
  };

  // Get dropdown button text
  const getDropdownButtonText = () => {
    if (selectedTrims.length === 0) {
      return 'All Trims';
    } else if (selectedTrims.length === 1) {
      return selectedTrims[0];
    } else {
      return `${selectedTrims.length} Trims`;
    }
  };

  // Get year dropdown button text
  const getYearDropdownButtonText = () => {
    if (selectedYears.length === 0) {
      return 'All Years';
    } else if (selectedYears.length === 1) {
      return selectedYears[0];
    } else {
      // Filter out "Unknown" for formatting
      const numericYears = selectedYears.filter(y => y !== 'Unknown').map(Number).sort((a, b) => a - b);
      const hasUnknown = selectedYears.includes('Unknown');

      // Check if years form a continuous range
      let isRange = numericYears.length > 1;
      for (let i = 1; i < numericYears.length; i++) {
        if (numericYears[i] !== numericYears[i - 1] + 1) {
          isRange = false;
          break;
        }
      }

      let text = '';
      if (isRange && numericYears.length > 0) {
        // Show as range: "'22-'24"
        const start = numericYears[0].toString().slice(-2);
        const end = numericYears[numericYears.length - 1].toString().slice(-2);
        text = `'${start}-'${end}`;
      } else if (numericYears.length > 0) {
        // Show as comma list: "'22,'24"
        text = numericYears.map(y => `'${y.toString().slice(-2)}`).join(',');
      }

      // Add "Unknown" if selected
      if (hasUnknown) {
        text = text ? `${text},?` : '?';
      }

      return text;
    }
  };

  // Get new listings and price-changed listings, filter for this model, and add days on market
  const newListings = filterByYear(filterByTrim(
    findNewListings(data, selectedDate)
      .filter(listing => `${listing.make} ${listing.model}` === model)
      .map(listing => ({
        ...listing,
        daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
      }))
  ));

  const priceChangedListings = filterByYear(filterByTrim(
    findListingsWithPriceChanges(data, selectedDate)
      .filter(listing => `${listing.make} ${listing.model}` === model)
      .map(listing => ({
        ...listing,
        daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
      }))
  ));

  const soldListings = filterByYear(filterByTrim(
    findSoldListings(data, selectedDate)
      .filter(listing => `${listing.make} ${listing.model}` === model)
      .map(listing => ({
        ...listing,
        daysOnMarket: calculateDaysOnMarket(data, listing.id, listing.source, selectedDate, listing.purchase_status)
      }))
  ));

  const filteredAllListings = filterByYear(filterByTrim(allListings));

  return (
    <div className="model-listings-view" ref={wrapperRef}>
      {tailPosition !== null && (
        <div
          className="model-listings-view__tail"
          style={{ left: `${tailPosition}px` }}
        />
      )}
      <div className="filters-container">
        {uniqueYears.length > 1 && (
          <div className="year-filter" ref={yearDropdownRef}>
            <button
              type="button"
              className="year-filter__button"
              onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
              aria-expanded={yearDropdownOpen}
              aria-haspopup="true"
            >
              <span>{getYearDropdownButtonText()}</span>
              <span className={`year-filter__arrow${yearDropdownOpen ? ' open' : ''}`}>▼</span>
            </button>
            {yearDropdownOpen && (
              <div className="year-filter__menu">
                {uniqueYears.map(year => (
                  <label key={year} className="year-filter__menu-item">
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(year)}
                      onChange={() => handleYearToggle(year)}
                    />
                    <span>{year}</span>
                  </label>
                ))}
                <div className="year-filter__menu-item">
                  <button
                    type="button"
                    className="year-filter__clear"
                    onClick={handleClearAllYears}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {uniqueTrims.length > 1 && (
          <div className="trim-filter" ref={dropdownRef}>
            <button
              type="button"
              className="trim-filter__button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <span>{getDropdownButtonText()}</span>
              <span className={`trim-filter__arrow${dropdownOpen ? ' open' : ''}`}>▼</span>
            </button>
            {dropdownOpen && (
              <div className="trim-filter__menu">
                {uniqueTrims.map(trim => (
                  <label key={trim} className="trim-filter__menu-item">
                    <input
                      type="checkbox"
                      checked={selectedTrims.includes(trim)}
                      onChange={() => handleTrimToggle(trim)}
                    />
                    <span>{trim}</span>
                  </label>
                ))}
                <div className="trim-filter__menu-item">
                  <button
                    type="button"
                    className="trim-filter__clear"
                    onClick={handleClearAllTrims}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <VehicleListingTabs
        newListings={newListings}
        changedListings={priceChangedListings}
        soldListings={soldListings}
        allListings={filteredAllListings}
        showModel={false}
      />
    </div>
  );
}
