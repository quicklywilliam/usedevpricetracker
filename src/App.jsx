import React, { useState, useEffect } from 'react';
import { loadAllData, getModelKey } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';
import DetailChart from './components/DetailChart';
import ModelListingsView from './components/ModelListingsView';
import NewListings from './components/NewListings';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

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

  if (loading) {
    return <div className="loading">Loading price data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const models = data.length > 0
    ? [...new Set(data.flatMap(d => d.listings.map(getModelKey)))]
    : [];

  return (
    <div className="app">
      <header>
        <h1>Used EV Finder</h1>
        <p>Compare used electric vehicle prices from multiple dealers and track changes over time.</p>
      </header>
      <main className="container">
        {!selectedModel ? (
          <>
            <OverviewChart data={data} onModelSelect={handleModelSelect} />
            <NewListings data={data} />
          </>
        ) : (
          <>
            <div className="breadcrumb">
              <a href="#" onClick={(e) => { e.preventDefault(); handleModelSelect(null); }}>
                All Models
              </a> / {selectedModel}
            </div>
            <DetailChart data={data} model={selectedModel} />
            <ModelListingsView data={data} model={selectedModel} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
