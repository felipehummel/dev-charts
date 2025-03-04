import { FC, useMemo, memo } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  useTheme 
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
import { ChartData, StatData } from '../types';

interface StatCardProps {
  data: ChartData;
  color?: string;
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
      
      <Box 
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
            backgroundColor: payload[0].color,
            mr: 1
          }} 
        />
        <Typography variant="body2">
          {payload[0].name}: {payload[0].value}
        </Typography>
      </Box>
    </Box>
  );
});

// Componente personalizado para a legenda
const CustomLegend = memo(({ payload }: any) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      justifyContent: 'center',
      gap: 2,
      mt: 2,
      p: 1
    }}>
      {payload.map((entry: any, index: number) => (
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
            {entry.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
});

const StatCardComponent: FC<StatCardProps> = ({ data, color }) => {
  const theme = useTheme();
  
  // Ordenar os dados por valor (do maior para o menor)
  const sortedData = useMemo(() => {
    return [...data.data].sort((a, b) => b.value - a.value);
  }, [data.data]);
  
  // Gerar cores para os usuários
  const userColors = useMemo(() => {
    return generateColors(sortedData.length);
  }, [sortedData.length]);
  
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" component="div">
            {data.name}
          </Typography>
          <Typography variant="h4" component="div" color="primary">
            {data.total.toLocaleString()}
          </Typography>
        </Box>
        
        <Box sx={{ height: 300, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={sortedData}
              margin={{
                top: 5,
                right: 30,
                left: 80,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis 
                type="category" 
                dataKey="user" 
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                content={<CustomTooltip />}
              />
              <Legend 
                content={<CustomLegend />}
                height={36}
              />
              <Bar 
                dataKey="value" 
                name={data.name} 
                fill={color || theme.palette.primary.main} 
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export const StatCard = memo(StatCardComponent);

export default StatCard; 