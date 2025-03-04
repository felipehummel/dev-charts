import { FC, useState, Suspense, lazy, memo } from 'react';
import { Box, Grid, Typography, CircularProgress, Alert, Tabs, Tab } from '@mui/material';
import { useGitHubData } from '../hooks/useGitHubData';
import Filters from './Filters';

// Carregamento lazy dos componentes pesados
const StatCard = lazy(() => import('./StatCard'));
const TimeSeriesChart = lazy(() => import('./TimeSeriesChart'));
const HourHistogramChart = lazy(() => import('./HourHistogramChart'));
const PullRequestList = lazy(() => import('./PullRequestList'));

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

const DashboardComponent: FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [isTabChanging, setIsTabChanging] = useState(false);
  const { 
    loading, 
    error, 
    repositories, 
    users, 
    filters, 
    setFilters, 
    stats,
    timeStats,
    showBlockedUsers,
    setShowBlockedUsers,
    pullRequestsByWeek,
    setCurrentTab
  } = useGitHubData();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setIsTabChanging(true);
    setTabValue(newValue);
    setCurrentTab(newValue);
    // Simular um pequeno atraso para mostrar o indicador de carregamento
    setTimeout(() => {
      setIsTabChanging(false);
    }, 300);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Erro ao carregar dados: {error}
        </Alert>
      </Box>
    );
  }

  // Filtrar usuários com base nos filtros selecionados
  const filteredUsers = filters.users.length > 0 
    ? filters.users 
    : users;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Dashboard GitHub - Estatísticas de PRs e Commits
      </Typography>
      
      <Filters 
        repositories={repositories}
        users={users}
        filters={filters}
        onFilterChange={setFilters}
        showBlockedUsers={showBlockedUsers}
        onToggleBlockedUsers={setShowBlockedUsers}
      />
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="dashboard tabs">
          <Tab label="Gráficos por Tempo" />
          <Tab label="Gráficos por Usuário" />
          <Tab label="Lista de Pull Requests" />
        </Tabs>
      </Box>
      
      {isTabChanging && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress size={30} />
        </Box>
      )}
      
      <TabPanel value={tabValue} index={0}>
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        }>
          <Grid container spacing={3}>
            <Grid item xs={12} md={12}>
              <TimeSeriesChart 
                title="PRs Abertos/Fechados" 
                data={timeStats.pullRequests.data} 
                users={filteredUsers}
              />
            </Grid>
            
            <Grid item xs={12} md={12}>
              <TimeSeriesChart 
                title="Commits" 
                data={timeStats.commits.data} 
                users={filteredUsers}
              />
            </Grid>
            
            <Grid item xs={12} md={12}>
              <TimeSeriesChart 
                title="Linhas Modificadas" 
                data={timeStats.lines.data} 
                users={filteredUsers}
              />
            </Grid>
            
            <Grid item xs={12} md={12}>
              <TimeSeriesChart 
                title="Reviews Aprovados" 
                data={timeStats.approvedReviews.data} 
                users={filteredUsers}
              />
            </Grid>
            
            <Grid item xs={12} md={12}>
              <TimeSeriesChart 
                title="Reviews Negados" 
                data={timeStats.rejectedReviews.data} 
                users={filteredUsers}
              />
            </Grid>
            
            <Grid item xs={12} md={12}>
              <TimeSeriesChart 
                title="Comentários" 
                data={timeStats.comments.data} 
                users={filteredUsers}
              />
            </Grid>
            
            <Grid item xs={12} md={12}>
              <HourHistogramChart 
                title="Commits por Hora do Dia" 
                data={timeStats.commitsByHour.data} 
                users={filteredUsers}
              />
            </Grid>
          </Grid>
        </Suspense>
      </TabPanel>
      
      <TabPanel value={tabValue} index={1}>
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        }>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <StatCard data={stats.pullRequests} />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <StatCard data={stats.commits} />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <StatCard data={stats.lines} />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <StatCard data={stats.approvedReviews} />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <StatCard data={stats.rejectedReviews} />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <StatCard data={stats.comments} />
            </Grid>
          </Grid>
        </Suspense>
      </TabPanel>
      
      <TabPanel value={tabValue} index={2}>
        <Suspense fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        }>
          <PullRequestList pullRequestsByWeek={pullRequestsByWeek} />
        </Suspense>
      </TabPanel>
    </Box>
  );
};

export const Dashboard = memo(DashboardComponent);

export default Dashboard; 