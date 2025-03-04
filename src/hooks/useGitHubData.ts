import { useState, useEffect, useMemo, useCallback } from 'react';
import { GitHubData, FilterState, TimeSeriesData, DailyUserData } from '../types';

// Função para verificar se um usuário deve ser bloqueado
const shouldBlockUser = (username: string): boolean => {
  // Verificar se o nome de usuário termina com [bot]
  return username.endsWith('[bot]');
};

export const useGitHubData = () => {
  const [data, setData] = useState<GitHubData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    repositories: [],
    users: [],
  });
  const [showBlockedUsers, setShowBlockedUsers] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<number>(0);

  // Novo estado para armazenar comentários por usuário
  const [commentsByUser, setCommentsByUser] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Buscar o arquivo JSON mais recente na pasta data
        const response = await fetch('/data/github-data-2025-03-04T20-17-50-610Z.json');
        if (!response.ok) {
          throw new Error('Falha ao carregar os dados');
        }
        const jsonData = await response.json();
        setData(jsonData);
        setLoading(false);
      } catch (err) {
        setError((err as Error).message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filtrar os dados com base nos filtros selecionados
  const filteredData = useMemo(() => {
    if (!data) return null;

    // Se não houver filtros, retornar todos os dados
    if (filters.repositories.length === 0 && filters.users.length === 0 && showBlockedUsers) {
      return data;
    }

    // Clonar os dados para não modificar o original
    const filteredData = { ...data };
    const filteredRepos: Record<string, any> = {};

    // Filtrar por repositório
    Object.entries(data.repositories).forEach(([repoName, repoData]) => {
      // Verificar se o repositório está nos filtros (se houver filtros)
      if (filters.repositories.length > 0 && !filters.repositories.includes(repoData.repository.name)) {
        return;
      }

      // Filtrar pull requests por usuário
      const filteredPRs = repoData.pull_requests.filter(pr => {
        // Verificar se o usuário está nos filtros (se houver filtros)
        if (filters.users.length > 0 && !filters.users.includes(pr.user.login)) {
          return false;
        }

        // Verificar se o usuário está bloqueado
        if (!showBlockedUsers && shouldBlockUser(pr.user.login)) {
          return false;
        }

        return true;
      });

      // Se houver PRs após a filtragem, adicionar o repositório aos resultados
      if (filteredPRs.length > 0) {
        filteredRepos[repoName] = {
          ...repoData,
          pull_requests: filteredPRs
        };
      }
    });

    filteredData.repositories = filteredRepos;
    return filteredData;
  }, [data, filters, showBlockedUsers]);

  // Extrair lista de repositórios
  const repositories = useMemo(() => {
    if (!data) return [];
    return Object.values(data.repositories).map(repo => repo.repository.name);
  }, [data]);

  // Extrair lista de usuários (excluindo bloqueados se necessário)
  const users = useMemo(() => {
    if (!data) return [];

    const userSet = new Set<string>();

    Object.values(data.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        if (showBlockedUsers || !shouldBlockUser(pr.user.login)) {
          userSet.add(pr.user.login);
        }
      });
    });

    return Array.from(userSet);
  }, [data, showBlockedUsers]);

  // Todos os usuários (incluindo bloqueados)
  const allUsers = useMemo(() => {
    if (!data) return [];

    const userSet = new Set<string>();

    Object.values(data.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        userSet.add(pr.user.login);
      });
    });

    return Array.from(userSet);
  }, [data]);

  // Função para calcular a diferença de tempo em minutos entre duas datas
  const calculateMinutesBetween = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return -1;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.round(diffMs / (1000 * 60)); // Convertendo para minutos
  };

  // Funções de formatação de data
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const getWeekKey = (dateString: string): string => {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay(); // 0 (Domingo) a 6 (Sábado)

    // Calcular o primeiro dia da semana (Domingo)
    const firstDayOfWeek = new Date(date);
    firstDayOfWeek.setDate(date.getDate() - dayOfWeek);

    return formatDate(firstDayOfWeek.toISOString());
  };

  const formatWeekDisplay = (weekKey: string): string => {
    const startDate = new Date(weekKey);

    // Calcular o último dia da semana (Sábado)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // Formatar as datas para exibição
    const startFormatted = `${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const endFormatted = `${String(endDate.getDate()).padStart(2, '0')}/${String(endDate.getMonth() + 1).padStart(2, '0')}/${endDate.getFullYear()}`;

    return `${startFormatted} - ${endFormatted}`;
  };

  const getHourOfDay = (dateString: string): number => {
    const date = new Date(dateString);
    return date.getHours();
  };

  // Otimizar a função groupByDay para evitar recálculos desnecessários
  const groupByDay = useCallback((
    items: Array<{ date: string; user: string }>,
    getValue: (item: any) => number
  ): TimeSeriesData[] => {
    // Usar Map para melhor desempenho em comparação com objetos
    const groupedByDay = new Map<string, DailyUserData>();

    // Processar os itens apenas uma vez
    items.forEach(item => {
      const dateKey = formatDate(item.date);
      const user = item.user;

      if (!groupedByDay.has(dateKey)) {
        groupedByDay.set(dateKey, {});
      }

      const dayData = groupedByDay.get(dateKey)!;

      if (!dayData[user]) {
        dayData[user] = 0;
      }

      dayData[user] += getValue(item);
    });

    // Converter para o formato esperado pelo gráfico
    return Array.from(groupedByDay.entries())
      .map(([date, userData]) => {
        const result: TimeSeriesData = {
          date,
          total: 0
        };

        Object.entries(userData).forEach(([user, value]) => {
          result[user] = value;
          result.total += value;
        });

        return result;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [formatDate]);

  // Otimizar a função groupByHourOfDay para evitar recálculos desnecessários
  const groupByHourOfDay = useCallback((
    items: Array<{ hour: number; user: string }>,
    getValue: (item: any) => number
  ): TimeSeriesData[] => {
    // Inicializar todas as horas do dia (0-23) com Map para melhor desempenho
    const groupedByHour = new Map<number, DailyUserData>();

    for (let hour = 0; hour < 24; hour++) {
      groupedByHour.set(hour, {});
    }

    // Processar os itens apenas uma vez
    items.forEach(item => {
      const hour = item.hour;
      const user = item.user;

      const hourData = groupedByHour.get(hour)!;

      if (!hourData[user]) {
        hourData[user] = 0;
      }

      hourData[user] += getValue(item);
    });

    // Converter para o formato esperado pelo gráfico
    return Array.from(groupedByHour.entries())
      .map(([hour, userData]) => {
        const hourStr = String(hour).padStart(2, '0');
        const result: TimeSeriesData = {
          date: `${hourStr}:00`,
          total: 0
        };

        Object.entries(userData).forEach(([user, value]) => {
          result[user] = value;
          result.total += value;
        });

        return result;
      })
      .sort((a, b) => parseInt(a.date) - parseInt(b.date));
  }, []);

  // Calcular estatísticas apenas quando necessário com base na aba ativa
  const pullRequestStats = useMemo(() => {
    if (!filteredData || activeTab !== 1) return { name: 'Pull Requests', data: [], total: 0 };

    const stats: Record<string, number> = {};
    let total = 0;

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        const user = pr.user.login;
        if (!stats[user]) {
          stats[user] = 0;
        }
        stats[user]++;
        total++;
      });
    });

    const data = Object.entries(stats).map(([user, value]) => ({ user, value }));

    return {
      name: 'Pull Requests',
      data,
      total
    };
  }, [filteredData, activeTab]);

  const commitStats = useMemo(() => {
    if (!filteredData || activeTab !== 1) return { name: 'Commits', data: [], total: 0 };

    const stats: Record<string, number> = {};
    let total = 0;

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.commits.forEach(commit => {
          // Verificar se o autor existe e tem login
          if (commit.author && commit.author.login) {
            const user = commit.author.login;
            if (!stats[user]) {
              stats[user] = 0;
            }
            stats[user]++;
            total++;
          }
        });
      });
    });

    const data = Object.entries(stats).map(([user, value]) => ({ user, value }));

    return {
      name: 'Commits',
      data,
      total
    };
  }, [filteredData, activeTab]);

  const linesStats = useMemo(() => {
    if (!filteredData || activeTab !== 1) return { name: 'Linhas Modificadas', data: [], total: 0 };

    const stats: Record<string, number> = {};
    let total = 0;

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.commits.forEach(commit => {
          // Verificar se o autor existe e tem login
          if (commit.author && commit.author.login) {
            const user = commit.author.login;
            const lines = commit.stats.additions + commit.stats.deletions;

            if (!stats[user]) {
              stats[user] = 0;
            }
            stats[user] += lines;
            total += lines;
          }
        });
      });
    });

    const data = Object.entries(stats).map(([user, value]) => ({ user, value }));

    return {
      name: 'Linhas Modificadas',
      data,
      total
    };
  }, [filteredData, activeTab]);

  const approvedReviewsStats = useMemo(() => {
    if (!filteredData || activeTab !== 1) return { name: 'Reviews Aprovados', data: [], total: 0 };

    const stats: Record<string, number> = {};
    let total = 0;

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.reviews.forEach(review => {
          // Verificar se o estado é APPROVED e o usuário existe
          if (review.state === 'APPROVED' && review.user && review.user.login) {
            const user = review.user.login;
            if (!stats[user]) {
              stats[user] = 0;
            }
            stats[user]++;
            total++;
          }
        });
      });
    });

    const data = Object.entries(stats).map(([user, value]) => ({ user, value }));

    return {
      name: 'Reviews Aprovados',
      data,
      total
    };
  }, [filteredData, activeTab]);

  const rejectedReviewsStats = useMemo(() => {
    if (!filteredData || activeTab !== 1) return { name: 'Reviews Negados', data: [], total: 0 };

    const stats: Record<string, number> = {};
    let total = 0;

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.reviews.forEach(review => {
          // Verificar se o estado é CHANGES_REQUESTED e o usuário existe
          if (review.state === 'CHANGES_REQUESTED' && review.user && review.user.login) {
            const user = review.user.login;
            if (!stats[user]) {
              stats[user] = 0;
            }
            stats[user]++;
            total++;
          }
        });
      });
    });

    const data = Object.entries(stats).map(([user, value]) => ({ user, value }));

    return {
      name: 'Reviews Negados',
      data,
      total
    };
  }, [filteredData, activeTab]);

  const commentsStats = useMemo(() => {
    if (!filteredData || activeTab !== 1) return { name: 'Comentários', data: [], total: 0 };

    const stats: Record<string, number> = {};
    let total = 0;

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.comments.forEach(comment => {
          // Verificar se o usuário existe
          if (comment.user && comment.user.login) {
            const user = comment.user.login;
            if (!stats[user]) {
              stats[user] = 0;
            }
            stats[user]++;
            total++;
          }
        });
      });
    });

    const data = Object.entries(stats).map(([user, value]) => ({ user, value }));

    return {
      name: 'Comentários',
      data,
      total
    };
  }, [filteredData, activeTab]);

  // Otimizar o cálculo de estatísticas por tempo
  const pullRequestTimeStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Pull Requests', data: [], total: 0 };

    // Usar Set para armazenar IDs já processados e evitar duplicações
    const processedIds = new Set<number>();
    const items: Array<{ date: string; user: string }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        // Verificar se o PR já foi processado
        if (processedIds.has(pr.id)) return;
        processedIds.add(pr.id);

        // Verificar se o usuário existe
        if (pr.user && pr.user.login && pr.created_at) {
          items.push({
            date: pr.created_at,
            user: pr.user.login
          });
        }
      });
    });

    const data = groupByDay(items, () => 1);
    const total = items.length;

    return {
      name: 'Pull Requests',
      data,
      total
    };
  }, [filteredData, groupByDay, activeTab]);

  const commitTimeStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Commits', data: [], total: 0 };

    const items: Array<{ date: string; user: string }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.commits.forEach(commit => {
          // Verificar se o autor e a data existem
          if (commit.author && commit.author.login && commit.commit && commit.commit.author && commit.commit.author.date) {
            items.push({
              date: commit.commit.author.date,
              user: commit.author.login
            });
          }
        });
      });
    });

    const data = groupByDay(items, () => 1);
    const total = items.length;

    return {
      name: 'Commits',
      data,
      total
    };
  }, [filteredData, groupByDay, activeTab]);

  const linesTimeStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Linhas Modificadas', data: [], total: 0 };

    const items: Array<{ date: string; user: string; lines: number }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.commits.forEach(commit => {
          // Verificar se o autor e a data existem
          if (commit.author && commit.author.login && commit.commit && commit.commit.author && commit.commit.author.date) {
            items.push({
              date: commit.commit.author.date,
              user: commit.author.login,
              lines: commit.stats.additions + commit.stats.deletions
            });
          }
        });
      });
    });

    const data = groupByDay(items, item => item.lines);
    const total = items.reduce((sum, item) => sum + item.lines, 0);

    return {
      name: 'Linhas Modificadas',
      data,
      total
    };
  }, [filteredData, groupByDay, activeTab]);

  const approvedReviewsTimeStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Reviews Aprovados', data: [], total: 0 };

    const items: Array<{ date: string; user: string }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.reviews.forEach(review => {
          // Verificar se o estado é APPROVED e o usuário existe
          if (review.state === 'APPROVED' && review.user && review.user.login && review.submitted_at) {
            items.push({
              date: review.submitted_at,
              user: review.user.login
            });
          }
        });
      });
    });

    const data = groupByDay(items, () => 1);
    const total = items.length;

    return {
      name: 'Reviews Aprovados',
      data,
      total
    };
  }, [filteredData, groupByDay, activeTab]);

  const rejectedReviewsTimeStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Reviews Negados', data: [], total: 0 };

    const items: Array<{ date: string; user: string }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.reviews.forEach(review => {
          // Verificar se o estado é CHANGES_REQUESTED e o usuário existe
          if (review.state === 'CHANGES_REQUESTED' && review.user && review.user.login && review.submitted_at) {
            items.push({
              date: review.submitted_at,
              user: review.user.login
            });
          }
        });
      });
    });

    const data = groupByDay(items, () => 1);
    const total = items.length;

    return {
      name: 'Reviews Negados',
      data,
      total
    };
  }, [filteredData, groupByDay, activeTab]);

  const commentsTimeStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Comentários', data: [], total: 0 };

    const items: Array<{ date: string; user: string }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.comments.forEach(comment => {
          // Verificar se o usuário e a data existem
          if (comment.user && comment.user.login && comment.created_at) {
            items.push({
              date: comment.created_at,
              user: comment.user.login
            });
          }
        });
      });
    });

    const data = groupByDay(items, () => 1);
    const total = items.length;

    return {
      name: 'Comentários',
      data,
      total
    };
  }, [filteredData, groupByDay, activeTab]);

  // Otimizar o cálculo de commits por hora
  const commitsByHourStats = useMemo(() => {
    if (!filteredData || activeTab !== 0) return { name: 'Commits por Hora', data: [], total: 0 };

    // Usar Map para armazenar commits já processados e evitar duplicações
    const processedShas = new Set<string>();
    const items: Array<{ hour: number; user: string }> = [];

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.commits.forEach(commit => {
          // Verificar se o commit já foi processado
          if (processedShas.has(commit.sha)) return;
          processedShas.add(commit.sha);

          // Verificar se o autor e a data existem
          if (commit.author && commit.author.login && commit.commit && commit.commit.author && commit.commit.author.date) {
            items.push({
              hour: getHourOfDay(commit.commit.author.date),
              user: commit.author.login
            });
          }
        });
      });
    });

    const data = groupByHourOfDay(items, () => 1);
    const total = items.length;

    return {
      name: 'Commits por Hora',
      data,
      total
    };
  }, [filteredData, groupByHourOfDay, getHourOfDay, activeTab]);

  // Agrupar PRs por semana - só calcular quando a aba 2 estiver ativa
  const pullRequestsByWeek = useMemo(() => {
    if (!filteredData || activeTab !== 2) return [];

    const prsByWeek: Record<string, {
      week: string,
      weekDisplay: string,
      prs: Array<{
        id: number,
        number: number,
        title: string,
        user: string,
        state: string,
        created_at: string,
        repository: string,
        html_url: string,
        timeToMerge: number,
        timeToFirstReview: number,
        timeToFirstApprove: number,
        timeToSecondApprove: number
      }>
    }> = {};

    // Filtrar os dados com base nos filtros selecionados
    Object.values(filteredData.repositories)
      .forEach(repo => {
        repo.pull_requests.forEach(pr => {
          // Verificar se o usuário existe
          if (!pr.user || !pr.user.login) return;

          // Determinar o estado real do PR (merged ou closed)
          let prState = pr.state;
          if (pr.state === 'closed' && pr.merged_at) {
            prState = 'merged';
          }

          // Calcular o tempo para merge/fechamento em minutos
          const timeToMerge = calculateMinutesBetween(
            pr.created_at,
            pr.merged_at || pr.closed_at || ''
          );

          // Ordenar as reviews por data de submissão
          const sortedReviews = [...pr.reviews].filter(review => review && review.user && review.user.login && review.submitted_at)
            .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());

          // Tempo para primeira revisão (qualquer estado) em minutos
          const timeToFirstReview = sortedReviews.length > 0
            ? calculateMinutesBetween(pr.created_at, sortedReviews[0].submitted_at)
            : -1;

          // Filtrar apenas reviews aprovadas
          const approvedReviews = sortedReviews.filter(review => review.state === 'APPROVED');

          // Tempo para primeiro approve em minutos
          const timeToFirstApprove = approvedReviews.length > 0
            ? calculateMinutesBetween(pr.created_at, approvedReviews[0].submitted_at)
            : -1;

          // Tempo para segundo approve em minutos
          const timeToSecondApprove = approvedReviews.length > 1
            ? calculateMinutesBetween(pr.created_at, approvedReviews[1].submitted_at)
            : -1;

          const weekKey = getWeekKey(pr.created_at);

          if (!prsByWeek[weekKey]) {
            prsByWeek[weekKey] = {
              week: weekKey,
              weekDisplay: formatWeekDisplay(weekKey),
              prs: []
            };
          }

          prsByWeek[weekKey].prs.push({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            user: pr.user.login,
            state: prState,
            created_at: pr.created_at,
            repository: repo.repository.name,
            html_url: pr.html_url,
            timeToMerge,
            timeToFirstReview,
            timeToFirstApprove,
            timeToSecondApprove
          });
        });
      });

    // Converter para array e ordenar por semana (mais recente primeiro)
    return Object.values(prsByWeek).sort((a, b) =>
      new Date(b.week).getTime() - new Date(a.week).getTime()
    );
  }, [filteredData, activeTab]);

  // Processar comentários por usuário
  useEffect(() => {
    if (!filteredData || activeTab !== 3) return;

    const userComments: Record<string, {
      user: string;
      avatar_url: string;
      comments: Array<{
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
      }>;
    }> = {};

    Object.values(filteredData.repositories).forEach(repo => {
      repo.pull_requests.forEach(pr => {
        pr.comments.forEach(comment => {
          if (comment.user && comment.user.login) {
            const user = comment.user.login;

            // Verificar se o usuário está bloqueado (bot)
            if (!showBlockedUsers && shouldBlockUser(user)) {
              return;
            }

            if (!userComments[user]) {
              userComments[user] = {
                user,
                avatar_url: comment.user.avatar_url,
                comments: []
              };
            }

            userComments[user].comments.push({
              id: comment.id,
              body: comment.body,
              user: {
                login: comment.user.login,
                avatar_url: comment.user.avatar_url
              },
              created_at: comment.created_at,
              html_url: comment.html_url,
              pr_number: pr.number,
              pr_title: pr.title,
              pr_html_url: pr.html_url,
              repository: repo.repository.name
            });
          }
        });
      });
    });

    // Ordenar usuários por número de comentários (decrescente)
    const sortedCommentsByUser = Object.values(userComments)
      .sort((a, b) => b.comments.length - a.comments.length)
      .map(userGroup => ({
        ...userGroup,
        // Ordenar comentários por data (mais recentes primeiro)
        comments: userGroup.comments.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      }));

    setCommentsByUser(sortedCommentsByUser);
  }, [filteredData, activeTab, showBlockedUsers]);

  // Função para atualizar a aba ativa
  const setCurrentTab = (tab: number) => {
    setActiveTab(tab);
  };

  return {
    loading,
    error,
    repositories,
    users,
    allUsers,
    filters,
    setFilters,
    showBlockedUsers,
    setShowBlockedUsers,
    pullRequestsByWeek,
    setCurrentTab,
    stats: {
      pullRequests: pullRequestStats,
      commits: commitStats,
      lines: linesStats,
      approvedReviews: approvedReviewsStats,
      rejectedReviews: rejectedReviewsStats,
      comments: commentsStats
    },
    timeStats: {
      pullRequests: pullRequestTimeStats,
      commits: commitTimeStats,
      lines: linesTimeStats,
      approvedReviews: approvedReviewsTimeStats,
      rejectedReviews: rejectedReviewsTimeStats,
      comments: commentsTimeStats,
      commitsByHour: commitsByHourStats
    },
    commentsByUser
  };
}; 