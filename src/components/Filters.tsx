import { FC } from 'react';
import { 
  Box, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Chip,
  OutlinedInput,
  SelectChangeEvent,
  Button,
  FormControlLabel,
  Switch,
  Divider,
  Typography
} from '@mui/material';
import { FilterState } from '../types';

interface FiltersProps {
  repositories: string[];
  users: string[];
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  showBlockedUsers: boolean;
  onToggleBlockedUsers: (show: boolean) => void;
}

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

export const Filters: FC<FiltersProps> = ({ 
  repositories, 
  users, 
  filters, 
  onFilterChange,
  showBlockedUsers,
  onToggleBlockedUsers
}) => {
  const handleRepositoryChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    onFilterChange({
      ...filters,
      repositories: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleUserChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    onFilterChange({
      ...filters,
      users: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleClearFilters = () => {
    onFilterChange({
      repositories: [],
      users: [],
    });
  };

  const handleToggleBlockedUsers = (event: React.ChangeEvent<HTMLInputElement>) => {
    onToggleBlockedUsers(event.target.checked);
  };

  return (
    <Box sx={{ mb: 4, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 2 }}>
        <FormControl sx={{ minWidth: 200, flex: 1 }}>
          <InputLabel id="repository-filter-label">Repositórios</InputLabel>
          <Select
            labelId="repository-filter-label"
            id="repository-filter"
            multiple
            value={filters.repositories}
            onChange={handleRepositoryChange}
            input={<OutlinedInput id="select-multiple-repositories" label="Repositórios" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </Box>
            )}
            MenuProps={MenuProps}
          >
            {repositories.map((repo) => (
              <MenuItem key={repo} value={repo}>
                {repo}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 200, flex: 1 }}>
          <InputLabel id="user-filter-label">Usuários</InputLabel>
          <Select
            labelId="user-filter-label"
            id="user-filter"
            multiple
            value={filters.users}
            onChange={handleUserChange}
            input={<OutlinedInput id="select-multiple-users" label="Usuários" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </Box>
            )}
            MenuProps={MenuProps}
          >
            {users.map((user) => (
              <MenuItem key={user} value={user}>
                {user}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Opções adicionais:
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={showBlockedUsers}
                onChange={handleToggleBlockedUsers}
                name="showBlockedUsers"
                color="primary"
              />
            }
            label="Mostrar bots e usuários bloqueados"
          />
        </Box>

        <Button 
          variant="outlined" 
          onClick={handleClearFilters}
          disabled={filters.repositories.length === 0 && filters.users.length === 0}
        >
          Limpar Filtros
        </Button>
      </Box>
    </Box>
  );
};

export default Filters; 