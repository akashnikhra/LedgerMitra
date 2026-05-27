import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import type { Company } from '@shared/types';
import Login from './components/Login';
import CompanySetup from './components/CompanySetup';
import FinancialYearSetup from './components/FinancialYearSetup';
import Dashboard from './components/Dashboard';

type Screen = 'login' | 'company' | 'fy' | 'app';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('login');
  const [company, setCompany] = useState<Company | null>(null);

  async function handleSignOut() {
    await window.electronAPI.logout();
    setCompany(null);
    setScreen('login');
  }

  if (screen === 'login') {
    return <Login onSuccess={() => setScreen('company')} />;
  }

  if (screen === 'company') {
    return (
      <CompanySetup
        onContinue={(c) => {
          setCompany(c);
          setScreen('fy');
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (screen === 'fy' && company) {
    return (
      <FinancialYearSetup
        company={company}
        onBack={() => setScreen('company')}
        onContinue={() => setScreen('app')}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <Dashboard
      company={company}
      onSignOut={handleSignOut}
      onChangeWorkspace={() => {
        setCompany(null);
        setScreen('company');
      }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
