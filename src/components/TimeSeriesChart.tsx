import { FC, useMemo, memo } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography
} from '@mui/material';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { TimeSeriesData } from '../types';

interface TimeSeriesChartProps {
  title: string;
  data: TimeSeriesData[];
  users: string[];
}

// Função para gerar cores para os usuários
const generateColors = (count: number) => {
  const colors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', 
    '#FFBB28', '#FF8042', '#a4de6c', '#d0ed57', '#83a6ed', '#8dd1e1'
  ];
  
  // Se tivermos mais usuários que cores, repetir as cores
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  
  return result;
};

// Componente personalizado para o tooltip
const CustomTooltip = memo(({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  // Filtrar itens com valor 0
  const filteredPayload = [...payload].filter(item => item.value > 0);

  // Se não houver itens após a filtragem, não mostrar o tooltip
  if (filteredPayload.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #ccc',
        padding: 1,
        borderRadius: 1,
        boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
      }}
    >
      <Typography variant="body2" fontWeight="bold" mb={1}>
        {label}
      </Typography>
      
      {filteredPayload.map((item: any, index: number) => (
        <Box 
          key={`item-${index}`}
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            mb: 0.5
          }}
        >
          <Box 
            sx={{ 
              width: 12, 
              height: 12, 
              backgroundColor: item.color,
              mr: 1
            }} 
          />
          <Typography variant="body2">
            {item.name}: {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
});

// Componente personalizado para a legenda
const CustomLegend = memo(({ payload, data, users }: any) => {
  // Calcular o total por usuário
  const userTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    
    users.forEach((user: string) => {
      totals[user] = data.reduce((sum: number, item: TimeSeriesData) => {
        return sum + (item[user] as number || 0);
      }, 0);
    });
    
    return totals;
  }, [data, users]);
  
  return (
    <Box sx={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      justifyContent: 'center',
      gap: 2,
      mt: 2,
      p: 1
    }}>
      {payload
        .slice()
        .sort((a: any, b: any) => (userTotals[b.value] || 0) - (userTotals[a.value] || 0))
        .map((entry: any, index: number) => (
        <Box 
          key={`item-${index}`}
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            mr: 2
          }}
        >
          <Box 
            sx={{ 
              width: 16, 
              height: 16, 
              backgroundColor: entry.color,
              mr: 1
            }} 
          />
          <Typography variant="body2">
            {entry.value}: {userTotals[entry.value]?.toLocaleString() || 0}
          </Typography>
        </Box>
      ))}
    </Box>
  );
});

// Função para formatar a data
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  return new Intl.DateTimeFormat('pt-BR').format(date);
};

const TimeSeriesChartComponent: FC<TimeSeriesChartProps> = ({ title, data, users }) => {
  // Calcular o total geral para exibir no título
  const totalCount = useMemo(() => {
    return data.reduce((sum, day) => sum + (day.total || 0), 0);
  }, [data]);
  
  // Calcular o total por usuário
  const userTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    
    users.forEach((user: string) => {
      totals[user] = data.reduce((sum: number, item: TimeSeriesData) => {
        return sum + (item[user] as number || 0);
      }, 0);
    });
    
    return totals;
  }, [data, users]);
  
  // Ordenar os usuários pelo total em ordem decrescente
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (userTotals[b] || 0) - (userTotals[a] || 0));
  }, [users, userTotals]);

  // Transformar os dados para garantir a ordem correta nas barras empilhadas
  const transformedData = useMemo(() => {
    return data.map(item => {
      const newItem: any = { ...item };
      
      // Remover as propriedades originais dos usuários
      users.forEach(user => {
        delete newItem[user];
      });
      
      // Adicionar as propriedades dos usuários na ordem correta (do maior para o menor)
      // Isso fará com que os usuários com maior valor fiquem mais próximos do eixo X
      sortedUsers.forEach(user => {
        newItem[user] = item[user] || 0;
      });
      
      return newItem;
    });
  }, [data, users, sortedUsers]);

  console.log(transformedData);
  
  // Gerar cores para os usuários
  const userColors = useMemo(() => {
    return generateColors(sortedUsers.length);
  }, [sortedUsers]);
  
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" component="div">
            {title}
          </Typography>
          <Typography variant="h4" component="div" color="primary">
            {totalCount.toLocaleString()}
          </Typography>
        </Box>
        
        <Box sx={{ height: 400, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={transformedData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={formatDate}
              />
              <YAxis />
              <Tooltip 
                content={<CustomTooltip />}
              />
              <Legend 
                content={<CustomLegend data={data} users={sortedUsers} />}
                height={60}
              />
              {sortedUsers.map((user, index) => (
                <Bar 
                  key={user}
                  dataKey={user}
                  name={user}
                  stackId="a"
                  fill={userColors[index]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export const TimeSeriesChart = memo(TimeSeriesChartComponent);

export default TimeSeriesChart; 