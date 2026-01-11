import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Calculator from './pages/Calculator';
import Landing from './pages/Landing';
import Insights from './pages/Insights';
import Records from './pages/Records';
import Exports from './pages/Exports';
import Settings from './pages/Settings';
import Methodology from './pages/Methodology';
import ScopeView from './pages/ScopeView';
import ScopeRoute from './pages/ScopeRoute';
import AppShell from './components/AppShell';
import AuthProvider from './components/AuthProvider';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<AppShell />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="calculator" element={<Calculator />} />
            <Route path="insights" element={<Insights />} />
            <Route path="records" element={<Navigate to="/scope/scope2" replace />} />
            <Route path="exports" element={<Exports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="methodology" element={<Methodology />} />
            <Route path="scope/:scopeId" element={<ScopeRoute />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
