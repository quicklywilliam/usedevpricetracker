import React, { useState, useEffect, useMemo } from 'react';
import { loadAllData } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';
import DetailChart from './components/DetailChart';
import ModelListingsView from './components/ModelListingsView';
import NewListings from './components/NewListings';
import NoTeslaToggle from './components/NoTeslaToggle';
import Footer from './components/Footer';
import { CATEGORY_TABS, DEFAULT_CATEGORY, filterDataByCategory } from './utils/modelCategories';

const TIME_RANGE_OPTIONS = [
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '6m', label: '6 Months', days: 180 },
];

const DEFAULT_RANGE_ID = TIME_RANGE_OPTIONS[1].id;
const MAX_TIME_RANGE_DAYS = TIME_RANGE_OPTIONS[TIME_RANGE_OPTIONS.length - 1].days;

function getTimeRangeOption(rangeId) {
  return TIME_RANGE_OPTIONS.find(option => option.id === rangeId) || TIME_RANGE_OPTIONS[0];
}

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [noTesla, setNoTesla] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [timeRangeId, setTimeRangeId] = useState(DEFAULT_RANGE_ID);

  const activeRangeOption = useMemo(
    () => getTimeRangeOption(timeRangeId),
    [timeRangeId]
  );

  const uniqueDatesDesc = useMemo(() => {
    if (data.length === 0) {
      return [];
    }
    const dates = [...new Set(data.map(d => d.scraped_at.split('T')[0]))];
    dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return dates;
  }, [data]);

  const mostRecentDate = uniqueDatesDesc.length > 0 ? uniqueDatesDesc[0] : null;

  const rangeDateLabels = useMemo(() => {
    if (!mostRecentDate) {
      return [];
    }

    const daysToUse = Math.max(1, activeRangeOption.days);
    const labels = [];
    const anchorDate = new Date(mostRecentDate);

    for (let offset = daysToUse - 1; offset >= 0; offset--) {
      const current = new Date(anchorDate);
      current.setDate(anchorDate.getDate() - offset);
      labels.push(current.toISOString().split('T')[0]);
    }

    return labels;
  }, [mostRecentDate, activeRangeOption]);

  const availableRangeDates = useMemo(() => {
    if (rangeDateLabels.length === 0 || uniqueDatesDesc.length === 0) {
      return [];
    }
    const availableSet = new Set(uniqueDatesDesc);
    return rangeDateLabels.filter(date => availableSet.has(date));
  }, [rangeDateLabels, uniqueDatesDesc]);

  useEffect(() => {
    if (!mostRecentDate || availableRangeDates.length === 0) {
      if (selectedDate !== null) {
        setSelectedDate(null);
        const url = new URL(window.location);
        url.searchParams.delete('date');
        window.history.replaceState({}, '', url);
      }
      return;
    }

    if (selectedDate && availableRangeDates.includes(selectedDate)) {
      return;
    }

    const fallbackDate = availableRangeDates[availableRangeDates.length - 1];
    if (!fallbackDate || fallbackDate === selectedDate) {
      return;
    }

    setSelectedDate(fallbackDate);

    const url = new URL(window.location);
    if (fallbackDate === mostRecentDate) {
      url.searchParams.delete('date');
    } else {
      url.searchParams.set('date', fallbackDate);
    }

    window.history.replaceState({}, '', url);
  }, [selectedDate, availableRangeDates, mostRecentDate]);

  useEffect(() => {
    let isMounted = true;

    loadAllData(MAX_TIME_RANGE_DAYS)
      .then(results => {
        if (!isMounted) {
          return;
        }

        setData(results);
        setLoading(false);

        const uniqueDates = results.length > 0
          ? [...new Set(results.map(d => d.scraped_at.split('T')[0]))].sort().reverse()
          : [];
        const mostRecentDate = uniqueDates[0] || null;

        const url = new URL(window.location);

        const modelParam = url.searchParams.get('model');
        if (modelParam && modelParam !== 'all') {
          setSelectedModel(modelParam);
        }

        const noTeslaParam = url.searchParams.get('noTesla');
        if (noTeslaParam === 'true') {
          setNoTesla(true);
        }

        const categoryParam = url.searchParams.get('category');
        if (categoryParam && CATEGORY_TABS.some(tab => tab.id === categoryParam)) {
          setSelectedCategory(categoryParam);
        } else {
          setSelectedCategory(DEFAULT_CATEGORY);
        }

        const rangeParam = url.searchParams.get('range');
        const validRangeIds = TIME_RANGE_OPTIONS.map(option => option.id);
        const resolvedRangeId = rangeParam && validRangeIds.includes(rangeParam)
          ? rangeParam
          : DEFAULT_RANGE_ID;
        setTimeRangeId(resolvedRangeId);

        if (rangeParam && rangeParam !== resolvedRangeId) {
          const updatedUrl = new URL(window.location);
          if (resolvedRangeId === DEFAULT_RANGE_ID) {
            updatedUrl.searchParams.delete('range');
          } else {
            updatedUrl.searchParams.set('range', resolvedRangeId);
          }
          window.history.replaceState({}, '', updatedUrl);
        }

        const dateParam = url.searchParams.get('date');
        if (dateParam && uniqueDates.includes(dateParam)) {
          setSelectedDate(dateParam);
        } else if (mostRecentDate) {
          setSelectedDate(mostRecentDate);
        }
      })
      .catch(err => {
        if (!isMounted) {
          return;
        }
        setError(err.message);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const modelParam = url.searchParams.get('model');
      setSelectedModel(modelParam && modelParam !== 'all' ? modelParam : null);
      const noTeslaParam = url.searchParams.get('noTesla');
      setNoTesla(noTeslaParam === 'true');

      // Handle date parameter
      const dateParam = url.searchParams.get('date');
      if (dateParam) {
        setSelectedDate(dateParam);
      } else if (data.length > 0) {
        // If no date param, use most recent
        const dates = [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort().reverse();
        setSelectedDate(dates[0]);
      }

      const categoryParam = url.searchParams.get('category');
      if (categoryParam && CATEGORY_TABS.some(tab => tab.id === categoryParam)) {
        setSelectedCategory(categoryParam);
      } else {
        setSelectedCategory(DEFAULT_CATEGORY);
      }

      const rangeParam = url.searchParams.get('range');
      const validRangeIds = TIME_RANGE_OPTIONS.map(option => option.id);
      const fallbackRangeId = rangeParam && validRangeIds.includes(rangeParam)
        ? rangeParam
        : DEFAULT_RANGE_ID;
      if (fallbackRangeId !== timeRangeId) {
        setTimeRangeId(fallbackRangeId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [data, timeRangeId]);

  const handleModelSelect = (model) => {
    const url = new URL(window.location);
    if (model === 'all' || !model) {
      url.searchParams.delete('model');
      setSelectedModel(null);
    } else {
      url.searchParams.set('model', model);
      setSelectedModel(model);
    }
    window.history.pushState({}, '', url);
  };

  const handleNoTeslaToggle = (enabled) => {
    setNoTesla(enabled);
    const url = new URL(window.location);
    if (enabled) {
      url.searchParams.set('noTesla', 'true');
    } else {
      url.searchParams.delete('noTesla');
    }
    window.history.pushState({}, '', url);
  };

  const handleCategorySelect = (categoryId) => {
    if (categoryId === selectedCategory) {
      return;
    }

    setSelectedCategory(categoryId);
    const url = new URL(window.location);
    if (categoryId === DEFAULT_CATEGORY) {
      url.searchParams.delete('category');
    } else {
      url.searchParams.set('category', categoryId);
    }
    window.history.pushState({}, '', url);
  };

  const handleTimeRangeChange = (rangeId, { replaceHistory = false } = {}) => {
    const validRangeIds = TIME_RANGE_OPTIONS.map(option => option.id);
    if (!rangeId || rangeId === timeRangeId || !validRangeIds.includes(rangeId)) {
      return;
    }

    setTimeRangeId(rangeId);

    const url = new URL(window.location);
    if (rangeId === DEFAULT_RANGE_ID) {
      url.searchParams.delete('range');
    } else {
      url.searchParams.set('range', rangeId);
    }
    window.history[replaceHistory ? 'replaceState' : 'pushState']({}, '', url);
  };

  const handleDateSelect = (date, { replaceHistory = false, force = false } = {}) => {
    if (!date) {
      return;
    }

    if (!force && date === selectedDate) {
      return;
    }

    if (!force && (availableRangeDates.length === 0 || !availableRangeDates.includes(date))) {
      return;
    }

    setSelectedDate(date);

    const mostRecentDate = uniqueDatesDesc.length > 0 ? uniqueDatesDesc[0] : null;
    const url = new URL(window.location);

    if (mostRecentDate && date === mostRecentDate) {
      url.searchParams.delete('date');
    } else {
      url.searchParams.set('date', date);
    }

    const historyMethod = replaceHistory ? 'replaceState' : 'pushState';
    window.history[historyMethod]({}, '', url);
  };

  // Filter out Tesla listings if NO TESLA is enabled
  const filterTesla = (data) => {
    if (!noTesla) return data;

    return data.map(sourceData => ({
      ...sourceData,
      listings: sourceData.listings.filter(listing => listing.make !== 'Tesla')
    }));
  };

  const dateFilteredData = useMemo(() => {
    if (data.length === 0 || rangeDateLabels.length === 0) {
      return [];
    }

    const allowedDates = new Set(rangeDateLabels);
    return data.filter(sourceData => {
      const dateOnly = sourceData.scraped_at.split('T')[0];
      return allowedDates.has(dateOnly);
    });
  }, [data, rangeDateLabels]);

  if (loading) {
    return <div className="loading">Loading price data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const filteredData = filterTesla(dateFilteredData);
  const categoryFilteredData = filterDataByCategory(filteredData, selectedCategory);

  const activeCategory = CATEGORY_TABS.find(tab => tab.id === selectedCategory) || CATEGORY_TABS[0] || null;
  const categoryDescription = activeCategory?.description ?? '';

  return (
    <div className="app">
      <header>
        <div className="header-content">
          <div>
            <h1>Used EV Tracker</h1>
          </div>
          <NoTeslaToggle enabled={noTesla} onChange={handleNoTeslaToggle} />
        </div>
        {!selectedModel && (
          <div className="category-filter">
            <div className="category-tabs" role="tablist" aria-label="Model price categories">
              {CATEGORY_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`category-tab${tab.id === selectedCategory ? ' active' : ''}`}
                  onClick={() => handleCategorySelect(tab.id)}
                  aria-pressed={tab.id === selectedCategory}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {categoryDescription && (
              <p className="category-helper">{categoryDescription}</p>
            )}
          </div>
        )}
      </header>
      <main className="container">
        {!selectedModel ? (
          <>
            <OverviewChart
              data={categoryFilteredData}
              onModelSelect={handleModelSelect}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
              timeRangeId={timeRangeId}
              onTimeRangeChange={handleTimeRangeChange}
              timeRangeOptions={TIME_RANGE_OPTIONS}
              dateLabels={rangeDateLabels}
              availableDates={availableRangeDates}
            />
            <NewListings data={categoryFilteredData} selectedDate={selectedDate} />
          </>
        ) : (
          <>
            <div className="breadcrumb">
              <a href="#" onClick={(e) => { e.preventDefault(); handleModelSelect(null); }}>
                All Models
              </a> / {selectedModel}
            </div>
            <DetailChart
              data={filteredData}
              model={selectedModel}
              onDateSelect={handleDateSelect}
              selectedDate={selectedDate}
              timeRangeId={timeRangeId}
              onTimeRangeChange={handleTimeRangeChange}
              timeRangeOptions={TIME_RANGE_OPTIONS}
              dateLabels={rangeDateLabels}
              availableDates={availableRangeDates}
            />
            <ModelListingsView
              data={filteredData}
              model={selectedModel}
              selectedDate={selectedDate}
            />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
