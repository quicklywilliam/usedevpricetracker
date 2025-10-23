import React, { useState, useEffect } from 'react';
import { loadAllData, getModelKey } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';
import DetailChart from './components/DetailChart';
import ModelListingsView from './components/ModelListingsView';
import NewListings from './components/NewListings';
import NoTeslaToggle from './components/NoTeslaToggle';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [noTesla, setNoTesla] = useState(false);

  useEffect(() => {
    loadAllData()
      .then(results => {
        setData(results);
        setLoading(false);

        // Load from URL
        const url = new URL(window.location);
        const modelParam = url.searchParams.get('model');
        if (modelParam && modelParam !== 'all') {
          setSelectedModel(modelParam);
        }
        const noTeslaParam = url.searchParams.get('noTesla');
        if (noTeslaParam === 'true') {
          setNoTesla(true);
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
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  const models = filteredData.length > 0
    ? [...new Set(filteredData.flatMap(d => d.listings.map(getModelKey)))]
    : [];

  return (
    <div className="app">
      <NoTeslaToggle enabled={noTesla} onChange={handleNoTeslaToggle} />
      <header>
        <h1>Used EV Finder</h1>
        <p>Compare used electric vehicle prices from multiple dealers and track changes over time.</p>
      </header>
      <main className="container">
        {!selectedModel ? (
          <>
            <OverviewChart data={filteredData} onModelSelect={handleModelSelect} />
            <NewListings data={filteredData} />
          </>
        ) : (
          <>
            <div className="breadcrumb">
              <a href="#" onClick={(e) => { e.preventDefault(); handleModelSelect(null); }}>
                All Models
              </a> / {selectedModel}
            </div>
            <DetailChart data={filteredData} model={selectedModel} />
            <ModelListingsView data={filteredData} model={selectedModel} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
