import React, { useState, useEffect } from 'react';
import { loadAllData } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAllData()
      .then(results => {
        setData(results);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="loading">Loading price data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="app">
      <header>
        <h1>Used EV Price Tracker</h1>
        <p>Track used electric vehicle prices across multiple sources</p>
      </header>
      <main className="container">
        <OverviewChart data={data} />
      </main>
    </div>
  );
}

export default App;
