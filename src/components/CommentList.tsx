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
  Tooltip,
  Avatar
} from '@mui/material';
import { 
  ExpandMore as ExpandMoreIcon, 
  Comment as CommentIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import GitHubIcon from '@mui/icons-material/GitHub';

interface Comment {
  id: number;
  body: string | null;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  html_url: string;
  pr_number: number;
  pr_title: string;
  pr_html_url: string;
  repository: string;
}

interface UserGroup {
  user: string;
  avatar_url: string;
  comments: Comment[];
}

interface CommentListProps {
  commentsByUser: UserGroup[];
}

export const CommentList: FC<CommentListProps> = ({ commentsByUser = [] }) => {
  const [expandedUser, setExpandedUser] = useState<string | false>(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleAccordionChange = (user: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedUser(isExpanded ? user : false);
  };

  // Trunca o texto do comentário para exibição
  const truncateText = (text: string | null, maxLength: number = 150) => {
    if (!text) return "Sem conteúdo";
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  return (
    <Box>
      <Typography variant="h5" component="h2" gutterBottom>
        Comentários por Usuário
      </Typography>
      
      {commentsByUser.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">
            Nenhum comentário encontrado com os filtros atuais.
          </Typography>
        </Paper>
      ) : (
        commentsByUser.map((userGroup) => (
          <Accordion 
            key={userGroup.user}
            expanded={expandedUser === userGroup.user}
            onChange={handleAccordionChange(userGroup.user)}
            sx={{ mb: 2 }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls={`${userGroup.user}-content`}
              id={`${userGroup.user}-header`}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <Avatar 
                  src={userGroup.avatar_url} 
                  alt={userGroup.user}
                  sx={{ mr: 2 }}
                >
                  <PersonIcon />
                </Avatar>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  {userGroup.user}
                </Typography>
                <Chip 
                  icon={<CommentIcon />} 
                  label={`${userGroup.comments.length} comentários`} 
                  color="primary" 
                  size="small"
                  sx={{ ml: 2 }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {userGroup.comments.map((comment) => (
                  <Box key={comment.id}>
                    <ListItem alignItems="flex-start">
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle1" component="span">
                              {comment.repository} - PR #{comment.pr_number}:
                            </Typography>
                            <Link 
                              href={comment.pr_html_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              sx={{ ml: 1, display: 'flex', alignItems: 'center' }}
                            >
                              <Typography variant="body2" color="primary">
                                {comment.pr_title}
                              </Typography>
                              <GitHubIcon fontSize="small" sx={{ ml: 0.5 }} />
                            </Link>
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.primary"
                              sx={{ display: 'block', mb: 1 }}
                            >
                              {truncateText(comment.body)}
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(comment.created_at)}
                              </Typography>
                              <Link 
                                href={comment.html_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                sx={{ display: 'flex', alignItems: 'center' }}
                              >
                                <Typography variant="caption" color="primary">
                                  Ver comentário
                                </Typography>
                                <GitHubIcon fontSize="small" sx={{ ml: 0.5, fontSize: '14px' }} />
                              </Link>
                            </Box>
                          </>
                        }
                      />
                    </ListItem>
                    <Divider component="li" />
                  </Box>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Box>
  );
};

export default CommentList; 