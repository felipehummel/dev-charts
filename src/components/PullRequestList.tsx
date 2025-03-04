import { FC, useState } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  Divider, 
  Chip, 
  Link, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  Paper,
  Grid,
  Tooltip
} from '@mui/material';
import { 
  ExpandMore as ExpandMoreIcon, 
  CheckCircle as CheckCircleIcon, 
  Cancel as CancelIcon,
  AccessTime as AccessTimeIcon,
  RateReview as RateReviewIcon,
  ThumbUp as ThumbUpIcon
} from '@mui/icons-material';
import GitHubIcon from '@mui/icons-material/GitHub';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface PullRequest {
  id: number;
  number: number;
  title: string;
  user: string;
  state: string; // 'open', 'closed' ou 'merged'
  created_at: string;
  repository: string;
  html_url: string;
  timeToMerge: number;
  timeToFirstReview: number;
  timeToFirstApprove: number;
  timeToSecondApprove: number;
}

interface WeekGroup {
  week: string;
  weekDisplay: string;
  prs: PullRequest[];
}

interface PullRequestListProps {
  pullRequestsByWeek: WeekGroup[];
}

export const PullRequestList: FC<PullRequestListProps> = ({ pullRequestsByWeek = [] }) => {
  const [expandedWeek, setExpandedWeek] = useState<string | false>(
    pullRequestsByWeek && pullRequestsByWeek.length > 0 ? pullRequestsByWeek[0].week : false
  );

  // Formatar data para exibição
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Data desconhecida';
    
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return 'Data inválida';
    }
  };

  // Renomeando para melhor refletir que agora trabalhamos com minutos
  const formatTime = (minutes: number) => {
    if (minutes < 0) return 'N/A';
    
    // Menos de 1 minuto
    if (minutes < 1) {
      return '<1min';
    }
    
    // Entre 1 e 59 minutos: mostrar em minutos
    if (minutes < 60) {
      return `${Math.round(minutes)}min`;
    }
    
    // Entre 1 e 48 horas: mostrar em horas
    const hours = minutes / 60;
    if (hours < 48) {
      return `${Math.round(hours)}h`;
    }
    
    // Mais de 48 horas: mostrar em dias
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  // Obter cor com base no estado do PR
  const getStateColor = (state: string) => {
    return state === 'open' ? '#2196f3' : 
           state === 'closed' ? '#f44336' : 
           '#4caf50'; // merged
  };

  // Obter texto do estado do PR
  const getStateText = (state: string) => {
    return state === 'open' ? 'Aberto' : 
           state === 'closed' ? 'Fechado' : 
           'Mergeado';
  };

  // Obter ícone com base no estado do PR
  const getStateIcon = (state: string) => {
    return state === 'open' ? undefined : 
           state === 'closed' ? <CancelIcon fontSize="small" /> : 
           <CheckCircleIcon fontSize="small" />;
  };

  const handleAccordionChange = (week: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedWeek(isExpanded ? week : false);
  };

  if (!pullRequestsByWeek || pullRequestsByWeek.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6">Nenhum Pull Request encontrado com os filtros atuais.</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Pull Requests por Semana
      </Typography>
      
      {pullRequestsByWeek.map((weekGroup) => (
        <Accordion 
          key={weekGroup.week} 
          expanded={expandedWeek === weekGroup.week}
          onChange={handleAccordionChange(weekGroup.week)}
          sx={{ mb: 2 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              {weekGroup.weekDisplay} ({weekGroup.prs?.length || 0} PRs)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {weekGroup.prs?.map((pr) => (
                <ListItem key={pr.id} sx={{ mb: 2, display: 'block', p: 0 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <Chip 
                              label={getStateText(pr.state || 'open')}
                              size="small"
                              icon={getStateIcon(pr.state || 'open')}
                              sx={{ 
                                backgroundColor: getStateColor(pr.state || 'open'),
                                color: 'white',
                                mr: 1
                              }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              #{pr.number || '?'} • {pr.repository || 'Repositório desconhecido'} • {formatDate(pr.created_at)}
                            </Typography>
                          </Box>
                          <Link 
                            href={pr.html_url || '#'} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            underline="hover"
                            sx={{ fontWeight: 'bold' }}
                          >
                            <Typography variant="subtitle1">
                              {pr.title || 'Título desconhecido'}
                            </Typography>
                          </Link>
                          <Typography variant="body2" color="text.secondary">
                            Autor: {pr.user || 'Desconhecido'}
                          </Typography>
                        </Grid>
                        
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            <Tooltip title="Tempo até merge/fechamento">
                              <Chip 
                                icon={<AccessTimeIcon />} 
                                label={`Merge: ${formatTime(pr.timeToMerge || -1)}`}
                                size="small"
                                variant="outlined"
                              />
                            </Tooltip>
                            
                            <Tooltip title="Tempo até primeira revisão">
                              <Chip 
                                icon={<RateReviewIcon />} 
                                label={`1ª Revisão: ${formatTime(pr.timeToFirstReview || -1)}`}
                                size="small"
                                variant="outlined"
                              />
                            </Tooltip>
                            
                            <Tooltip title="Tempo até primeiro approve">
                              <Chip 
                                icon={<ThumbUpIcon />} 
                                label={`1º Approve: ${formatTime(pr.timeToFirstApprove || -1)}`}
                                size="small"
                                variant="outlined"
                              />
                            </Tooltip>
                            
                            <Tooltip title="Tempo até segundo approve">
                              <Chip 
                                icon={<ThumbUpIcon />} 
                                label={`2º Approve: ${formatTime(pr.timeToSecondApprove || -1)}`}
                                size="small"
                                variant="outlined"
                              />
                            </Tooltip>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default PullRequestList;