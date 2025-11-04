import React, { useState, useEffect } from 'react';
import { loadAllData } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';
import DetailChart from './components/DetailChart';
import ModelListingsView from './components/ModelListingsView';
import NewListings from './components/NewListings';
import NoTeslaToggle from './components/NoTeslaToggle';
import Footer from './components/Footer';
import { CATEGORY_TABS, DEFAULT_CATEGORY, filterDataByCategory } from './utils/modelCategories';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [noTesla, setNoTesla] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);

  useEffect(() => {
    loadAllData()
      .then(results => {
        setData(results);
        setLoading(false);

        // Get the most recent date
        const dates = results.length > 0
          ? [...new Set(results.map(d => d.scraped_at.split('T')[0]))].sort().reverse()
          : [];
        const mostRecentDate = dates[0];

        // Load from URL
        const url = new URL(window.location);

        // Load date from URL, or use most recent
        const dateParam = url.searchParams.get('date');
        if (dateParam && dates.includes(dateParam)) {
          setSelectedDate(dateParam);
        } else if (mostRecentDate) {
          setSelectedDate(mostRecentDate);
        }

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
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
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
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [data]);

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

  const handleDateSelect = (date) => {
    setSelectedDate(date);

    // Get the most recent date to determine if we should include date param
    const dates = data.length > 0
      ? [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort().reverse()
      : [];
    const mostRecentDate = dates[0];

    const url = new URL(window.location);
    if (date === mostRecentDate) {
      // If selecting today (most recent), remove the date parameter
      url.searchParams.delete('date');
    } else {
      // Otherwise, set the date parameter
      url.searchParams.set('date', date);
    }
    window.history.pushState({}, '', url);
  };

  // Filter out Tesla listings if NO TESLA is enabled
  const filterTesla = (data) => {
    if (!noTesla) return data;

    return data.map(sourceData => ({
      ...sourceData,
      listings: sourceData.listings.filter(listing => listing.make !== 'Tesla')
    }));
  };

  if (loading) {
    return <div className="loading">Loading price data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const filteredData = filterTesla(data);
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
