import { Octokit } from 'octokit';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Tipos para os dados do GitHub
interface User {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

interface Label {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface Commit {
  sha: string;
  author: User | null;
  committer: User | null;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

interface Review {
  id: number;
  user: User;
  body: string | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submitted_at: string;
  html_url: string;
}

interface ReviewRequest {
  id?: number;
  user: User;
  requested_at?: string;
}

interface Comment {
  id: number;
  user: User;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  comment_type: 'pr_review' | 'pr_line' | 'issue';
  path?: string;           // Caminho do arquivo para comentários em linhas de código
  position?: number;       // Posição no diff para comentários em linhas de código
  original_position?: number; // Posição original no diff
  commit_id?: string;      // ID do commit para comentários em linhas de código
  diff_hunk?: string;      // Trecho do diff para comentários em linhas de código
  in_reply_to_id?: number; // ID do comentário ao qual este é uma resposta
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  user: User;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  assignees: User[];
  requested_reviewers: User[];
  labels: Label[];
  draft: boolean;
  head: {
    ref: string;
    sha: string;
    repo: {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
    };
  };
  base: {
    ref: string;
    sha: string;
    repo: {
      id: number;
      name: string;
      full_name: string;
      html_url: string;
    };
  };
  html_url: string;
  commits: Commit[];
  reviews: Review[];
  review_requests: ReviewRequest[];
  comments: Comment[];
  additions: number;
  deletions: number;
  changed_files: number;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  forks_count: number;
  archived: boolean;
  disabled: boolean;
  open_issues_count: number;
  license: {
    key: string;
    name: string;
    spdx_id: string;
    url: string;
  } | null;
  topics: string[];
  visibility: 'public' | 'private';
  default_branch: string;
}

interface GitHubData {
  organization: string;
  generated_at: string;
  repositories: {
    [repoName: string]: {
      repository: Repository;
      pull_requests: PullRequest[];
    };
  };
  summary: {
    total_repositories: number;
    total_pull_requests: number;
    open_pull_requests: number;
    closed_pull_requests: number;
    merged_pull_requests: number;
    total_commits: number;
    total_comments: number;
    total_reviews: number;
    total_review_requests: number;
    total_additions: number;
    total_deletions: number;
    total_changed_files: number;
  };
}

// Função principal
async function main() {
  try {
    // Verifica se o número de dias foi fornecido como argumento
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.error('Por favor, forneça o número de dias como argumento.');
      process.exit(1);
    }

    const days = parseInt(args[0], 10);
    if (isNaN(days) || days <= 0) {
      console.error('O número de dias deve ser um número positivo.');
      process.exit(1);
    }

    // Verifica se as variáveis de ambiente necessárias estão definidas
    const token = process.env.GH_TOKEN;
    const org = process.env.GH_ORG;

    if (!token || !org) {
      console.error('As variáveis de ambiente GH_TOKEN e GH_ORG devem estar definidas no arquivo .env');
      process.exit(1);
    }

    console.log(`Buscando dados para a organização ${org} dos últimos ${days} dias...`);

    // Inicializa o cliente Octokit
    const octokit = new Octokit({
      auth: token
    });

    // Calcula a data de início (X dias atrás)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateString = startDate.toISOString();

    // Busca todos os repositórios da organização
    const repositories = await fetchAllRepositories(octokit, org);
    console.log(`Encontrados ${repositories.length} repositórios.`);

    // Inicializa o objeto de dados
    const data: GitHubData = {
      organization: org,
      generated_at: new Date().toISOString(),
      repositories: {},
      summary: {
        total_repositories: repositories.length,
        total_pull_requests: 0,
        open_pull_requests: 0,
        closed_pull_requests: 0,
        merged_pull_requests: 0,
        total_commits: 0,
        total_comments: 0,
        total_reviews: 0,
        total_review_requests: 0,
        total_additions: 0,
        total_deletions: 0,
        total_changed_files: 0
      }
    };

    // Para cada repositório, busca os PRs
    for (const repo of repositories) {
      console.log(`Processando repositório: ${repo.name}`);

      // Busca todos os PRs do repositório desde a data de início
      const pullRequests = await fetchAllPullRequests(octokit, org, repo.name, startDateString);
      console.log(`  Encontrados ${pullRequests.length} PRs desde ${new Date(startDateString).toLocaleDateString()}`);

      if (pullRequests.length === 0) {
        continue;
      }

      // Para cada PR, busca commits, reviews, comentários e detalhes
      const detailedPRs: PullRequest[] = [];

      for (const pr of pullRequests) {
        console.log(`  Processando PR #${pr.number}: ${pr.title}`);

        // Busca detalhes completos do PR
        const detailedPR = await fetchPullRequestDetails(octokit, org, repo.name, pr.number);

        // Busca commits do PR
        const commits = await fetchPullRequestCommits(octokit, org, repo.name, pr.number);
        detailedPR.commits = commits;

        // Busca reviews do PR
        const reviews = await fetchPullRequestReviews(octokit, org, repo.name, pr.number);
        detailedPR.reviews = reviews;

        // Busca comentários do PR
        const comments = await fetchPullRequestComments(octokit, org, repo.name, pr.number);
        detailedPR.comments = comments;

        // Busca solicitações de revisão
        const reviewRequests = await fetchReviewRequests(octokit, org, repo.name, pr.number);
        detailedPR.review_requests = reviewRequests;

        detailedPRs.push(detailedPR);

        // Atualiza estatísticas
        data.summary.total_commits += commits.length;
        data.summary.total_comments += comments.length;
        data.summary.total_reviews += reviews.length;
        data.summary.total_review_requests += reviewRequests.length;
        data.summary.total_additions += detailedPR.additions || 0;
        data.summary.total_deletions += detailedPR.deletions || 0;
        data.summary.total_changed_files += detailedPR.changed_files || 0;
      }

      // Atualiza o objeto de dados com os PRs deste repositório
      data.repositories[repo.name] = {
        repository: repo,
        pull_requests: detailedPRs
      };

      // Atualiza estatísticas gerais
      data.summary.total_pull_requests += detailedPRs.length;
      data.summary.open_pull_requests += detailedPRs.filter(pr => pr.state === 'open').length;
      data.summary.closed_pull_requests += detailedPRs.filter(pr => pr.state === 'closed' && !pr.merged_at).length;
      data.summary.merged_pull_requests += detailedPRs.filter(pr => pr.merged_at !== null).length;
    }

    // Cria o diretório de saída se não existir
    const outputDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Gera o nome do arquivo com timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `github-data-${timestamp}.json`);

    // Escreve os dados no arquivo
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

    console.log(`\nDados salvos com sucesso em: ${outputFile}`);
    console.log('\nResumo:');
    console.log(`- Total de repositórios: ${data.summary.total_repositories}`);
    console.log(`- Total de PRs: ${data.summary.total_pull_requests}`);
    console.log(`- PRs abertos: ${data.summary.open_pull_requests}`);
    console.log(`- PRs fechados: ${data.summary.closed_pull_requests}`);
    console.log(`- PRs mesclados: ${data.summary.merged_pull_requests}`);
    console.log(`- Total de commits: ${data.summary.total_commits}`);
    console.log(`- Total de comentários: ${data.summary.total_comments}`);
    console.log(`- Total de revisões: ${data.summary.total_reviews}`);
    console.log(`- Total de solicitações de revisão: ${data.summary.total_review_requests}`);
    console.log(`- Total de linhas adicionadas: ${data.summary.total_additions}`);
    console.log(`- Total de linhas removidas: ${data.summary.total_deletions}`);
    console.log(`- Total de arquivos alterados: ${data.summary.total_changed_files}`);

  } catch (error) {
    console.error('Erro ao executar o script:', error);
    process.exit(1);
  }
}

// Função para buscar todos os repositórios privados de uma organização
async function fetchAllRepositories(octokit: Octokit, org: string): Promise<Repository[]> {
  const repositories: Repository[] = [];
  let page = 1;
  let hasMorePages = true;
  let totalRepos = 0;
  let privateRepos = 0;

  console.log(`Buscando repositórios para a organização: ${org}`);

  while (hasMorePages) {
    try {
      console.log(`Buscando página ${page} de repositórios...`);
      const response = await octokit.request('GET /orgs/{org}/repos', {
        org,
        type: 'all',
        per_page: 100,
        page
      });

      console.log(`Encontrados ${response.data.length} repositórios na página ${page}`);
      totalRepos += response.data.length;

      if (response.data.length === 0) {
        hasMorePages = false;
      } else {
        // Conta quantos repositórios privados existem nesta página
        const privateReposInPage = response.data.filter(repo => repo.private === true).length;
        privateRepos += privateReposInPage;
        console.log(`Repositórios privados nesta página: ${privateReposInPage}`);

        // Imprime informações sobre cada repositório para depuração
        response.data.forEach((repo, index) => {
          console.log(`Repo ${index + 1}: ${repo.name}, Privado: ${repo.private}, Visibilidade: ${repo.visibility}`);
        });

        // Filtra apenas repositórios privados e converte para o formato Repository
        const formattedRepos = response.data
          .filter(repo => repo.private === true) // Filtra apenas repositórios privados
          .map(repo => {
            // Formata a licença para o formato correto
            let formattedLicense: { key: string; name: string; spdx_id: string; url: string; } | null = null;
            if (repo.license) {
              formattedLicense = {
                key: repo.license.key || '',
                name: repo.license.name || '',
                spdx_id: repo.license.spdx_id || '',
                url: repo.license.url || ''
              };
            }

            // Garante que a visibilidade seja 'private' ou 'public'
            const visibility: 'public' | 'private' = 'private';

            return {
              id: repo.id,
              name: repo.name,
              full_name: repo.full_name,
              html_url: repo.html_url,
              description: repo.description,
              fork: repo.fork,
              created_at: repo.created_at || '',
              updated_at: repo.updated_at || '',
              pushed_at: repo.pushed_at || '',
              homepage: repo.homepage as string | null,
              size: repo.size || 0, // Garante que size seja um número
              stargazers_count: repo.stargazers_count || 0, // Garante que seja um número
              watchers_count: repo.watchers_count || 0, // Garante que seja um número
              language: repo.language as string | null, // Garante que seja string | null
              forks_count: repo.forks_count || 0, // Garante que seja um número
              archived: repo.archived || false, // Garante que seja um booleano
              disabled: repo.disabled || false, // Garante que seja um booleano
              open_issues_count: repo.open_issues_count || 0, // Garante que seja um número
              license: formattedLicense,
              topics: repo.topics || [],
              visibility: visibility, // Forçamos como privado já que filtramos apenas privados
              default_branch: repo.default_branch || 'main'
            };
          });

        repositories.push(...formattedRepos);
        page++;
      }
    } catch (error) {
      console.error('Erro ao buscar repositórios:', error);
      hasMorePages = false;
    }
  }

  console.log(`Total de repositórios encontrados: ${totalRepos}`);
  console.log(`Total de repositórios privados: ${privateRepos}`);
  console.log(`Repositórios privados formatados: ${repositories.length}`);

  // Se não encontrou nenhum repositório privado, vamos tentar buscar todos os repositórios
  if (repositories.length === 0 && totalRepos > 0) {
    console.log("Não foram encontrados repositórios privados. Tentando buscar todos os repositórios...");

    // Reinicia a busca para todos os repositórios
    page = 1;
    hasMorePages = true;

    while (hasMorePages) {
      try {
        const response = await octokit.request('GET /orgs/{org}/repos', {
          org,
          type: 'all',
          per_page: 100,
          page
        });

        if (response.data.length === 0) {
          hasMorePages = false;
        } else {
          // Converte todos os repositórios para o formato Repository
          const formattedRepos = response.data.map(repo => {
            // Formata a licença para o formato correto
            let formattedLicense: { key: string; name: string; spdx_id: string; url: string; } | null = null;
            if (repo.license) {
              formattedLicense = {
                key: repo.license.key || '',
                name: repo.license.name || '',
                spdx_id: repo.license.spdx_id || '',
                url: repo.license.url || ''
              };
            }

            // Determina a visibilidade
            const visibility: 'public' | 'private' = repo.private ? 'private' : 'public';

            return {
              id: repo.id,
              name: repo.name,
              full_name: repo.full_name,
              html_url: repo.html_url,
              description: repo.description,
              fork: repo.fork,
              created_at: repo.created_at || '',
              updated_at: repo.updated_at || '',
              pushed_at: repo.pushed_at || '',
              homepage: repo.homepage as string | null,
              size: repo.size || 0,
              stargazers_count: repo.stargazers_count || 0,
              watchers_count: repo.watchers_count || 0,
              language: repo.language as string | null,
              forks_count: repo.forks_count || 0,
              archived: repo.archived || false,
              disabled: repo.disabled || false,
              open_issues_count: repo.open_issues_count || 0,
              license: formattedLicense,
              topics: repo.topics || [],
              visibility: visibility,
              default_branch: repo.default_branch || 'main'
            };
          });

          repositories.push(...formattedRepos);
          page++;
        }
      } catch (error) {
        console.error('Erro ao buscar todos os repositórios:', error);
        hasMorePages = false;
      }
    }

    console.log(`Total de repositórios (incluindo públicos) formatados: ${repositories.length}`);
  }

  return repositories;
}

// Função para buscar todos os PRs de um repositório desde uma data específica
async function fetchAllPullRequests(octokit: Octokit, owner: string, repo: string, since: string): Promise<PullRequest[]> {
  const pullRequests: PullRequest[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
      page
    });

    if (response.data.length === 0) {
      hasMorePages = false;
    } else {
      // Filtra PRs que foram atualizados após a data de início
      const filteredPRs = response.data.filter(pr => new Date(pr.updated_at) >= new Date(since));

      if (filteredPRs.length < response.data.length) {
        // Se algum PR foi filtrado, significa que chegamos aos PRs mais antigos que o período desejado
        hasMorePages = false;
      }

      // Formata os PRs para o tipo PullRequest
      for (const pr of filteredPRs) {
        // Busca detalhes adicionais do PR para obter additions, deletions e changed_files
        let additions = 0;
        let deletions = 0;
        let changed_files = 0;

        try {
          // Busca detalhes completos do PR para obter estatísticas
          const detailedPR = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
            owner,
            repo,
            pull_number: pr.number
          });

          // Extrai as estatísticas se disponíveis
          additions = detailedPR.data.additions || 0;
          deletions = detailedPR.data.deletions || 0;
          changed_files = detailedPR.data.changed_files || 0;
        } catch (error) {
          console.warn(`Não foi possível obter estatísticas para o PR #${pr.number}`);
        }

        const formattedPR: PullRequest = {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          user: {
            login: pr.user?.login || 'unknown',
            id: pr.user?.id || 0,
            avatar_url: pr.user?.avatar_url || '',
            html_url: pr.user?.html_url || ''
          },
          state: pr.state as 'open' | 'closed',
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          closed_at: pr.closed_at,
          merged_at: pr.merged_at,
          merge_commit_sha: pr.merge_commit_sha,
          assignees: (pr.assignees || []).map(assignee => ({
            login: assignee.login,
            id: assignee.id,
            avatar_url: assignee.avatar_url,
            html_url: assignee.html_url
          })),
          requested_reviewers: (pr.requested_reviewers || []).map(reviewer => ({
            login: reviewer.login,
            id: reviewer.id,
            avatar_url: reviewer.avatar_url,
            html_url: reviewer.html_url
          })),
          labels: (pr.labels || []).map(label => ({
            id: typeof label.id === 'number' ? label.id : 0,
            name: label.name,
            color: label.color || '',
            description: label.description || ''
          })),
          draft: pr.draft || false,
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha,
            repo: {
              id: pr.head.repo?.id || 0,
              name: pr.head.repo?.name || '',
              full_name: pr.head.repo?.full_name || '',
              html_url: pr.head.repo?.html_url || ''
            }
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha,
            repo: {
              id: pr.base.repo?.id || 0,
              name: pr.base.repo?.name || '',
              full_name: pr.base.repo?.full_name || '',
              html_url: pr.base.repo?.html_url || ''
            }
          },
          html_url: pr.html_url,
          commits: [],
          reviews: [],
          review_requests: [],
          comments: [],
          additions: additions,
          deletions: deletions,
          changed_files: changed_files
        };

        pullRequests.push(formattedPR);
      }

      page++;
    }
  }

  return pullRequests;
}

// Função para buscar detalhes de um PR específico
async function fetchPullRequestDetails(octokit: Octokit, owner: string, repo: string, pull_number: number): Promise<PullRequest> {
  const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number
  });

  const pr = response.data;

  // Formata o PR para o tipo PullRequest
  const formattedPR: PullRequest = {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    user: {
      login: pr.user?.login || 'unknown',
      id: pr.user?.id || 0,
      avatar_url: pr.user?.avatar_url || '',
      html_url: pr.user?.html_url || ''
    },
    state: pr.state as 'open' | 'closed',
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    closed_at: pr.closed_at,
    merged_at: pr.merged_at,
    merge_commit_sha: pr.merge_commit_sha,
    assignees: (pr.assignees || []).map(assignee => ({
      login: assignee.login,
      id: assignee.id,
      avatar_url: assignee.avatar_url,
      html_url: assignee.html_url
    })),
    requested_reviewers: (pr.requested_reviewers || []).map(reviewer => ({
      login: reviewer.login,
      id: reviewer.id,
      avatar_url: reviewer.avatar_url,
      html_url: reviewer.html_url
    })),
    labels: (pr.labels || []).map(label => ({
      id: typeof label.id === 'number' ? label.id : 0,
      name: label.name,
      color: label.color || '',
      description: label.description || ''
    })),
    draft: pr.draft || false,
    head: {
      ref: pr.head.ref,
      sha: pr.head.sha,
      repo: {
        id: pr.head.repo?.id || 0,
        name: pr.head.repo?.name || '',
        full_name: pr.head.repo?.full_name || '',
        html_url: pr.head.repo?.html_url || ''
      }
    },
    base: {
      ref: pr.base.ref,
      sha: pr.base.sha,
      repo: {
        id: pr.base.repo?.id || 0,
        name: pr.base.repo?.name || '',
        full_name: pr.base.repo?.full_name || '',
        html_url: pr.base.repo?.html_url || ''
      }
    },
    html_url: pr.html_url,
    commits: [],
    reviews: [],
    review_requests: [],
    comments: [],
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changed_files: pr.changed_files || 0
  };

  return formattedPR;
}

// Função para buscar commits de um PR
async function fetchPullRequestCommits(octokit: Octokit, owner: string, repo: string, pull_number: number): Promise<Commit[]> {
  const commits: Commit[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
      owner,
      repo,
      pull_number,
      per_page: 100,
      page
    });

    if (response.data.length === 0) {
      hasMorePages = false;
    } else {
      // Para cada commit, busca estatísticas detalhadas
      for (const apiCommit of response.data) {
        try {
          const detailedCommit = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
            owner,
            repo,
            ref: apiCommit.sha
          });

          // Formata o commit para o tipo Commit
          const commit: Commit = {
            sha: apiCommit.sha,
            author: apiCommit.author ? {
              login: apiCommit.author.login,
              id: apiCommit.author.id,
              avatar_url: apiCommit.author.avatar_url,
              html_url: apiCommit.author.html_url
            } : null,
            committer: apiCommit.committer ? {
              login: apiCommit.committer.login,
              id: apiCommit.committer.id,
              avatar_url: apiCommit.committer.avatar_url,
              html_url: apiCommit.committer.html_url
            } : null,
            commit: {
              author: {
                name: apiCommit.commit.author?.name || '',
                email: apiCommit.commit.author?.email || '',
                date: apiCommit.commit.author?.date || ''
              },
              committer: {
                name: apiCommit.commit.committer?.name || '',
                email: apiCommit.commit.committer?.email || '',
                date: apiCommit.commit.committer?.date || ''
              },
              message: apiCommit.commit.message
            },
            html_url: apiCommit.html_url,
            stats: detailedCommit.data.stats ? {
              additions: detailedCommit.data.stats.additions || 0,
              deletions: detailedCommit.data.stats.deletions || 0,
              total: detailedCommit.data.stats.total || 0
            } : undefined
          };

          commits.push(commit);
        } catch (error) {
          console.warn(`Não foi possível obter estatísticas para o commit ${apiCommit.sha}`);
        }
      }

      page++;
    }
  }

  return commits;
}

// Função para buscar reviews de um PR
async function fetchPullRequestReviews(octokit: Octokit, owner: string, repo: string, pull_number: number): Promise<Review[]> {
  const reviews: Review[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
      owner,
      repo,
      pull_number,
      per_page: 100,
      page
    });

    if (response.data.length === 0) {
      hasMorePages = false;
    } else {
      // Formata os reviews para o tipo Review
      const formattedReviews = response.data
        .filter(review => review.user !== null) // Filtra reviews sem usuário
        .map(review => ({
          id: review.id,
          user: {
            login: review.user!.login,
            id: review.user!.id,
            avatar_url: review.user!.avatar_url,
            html_url: review.user!.html_url
          },
          body: review.body,
          state: review.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING',
          submitted_at: review.submitted_at || '',
          html_url: review.html_url
        }));

      reviews.push(...formattedReviews);
      page++;
    }
  }

  return reviews;
}

// Função para buscar comentários de um PR
async function fetchPullRequestComments(octokit: Octokit, owner: string, repo: string, pull_number: number): Promise<Comment[]> {
  const comments: Comment[] = [];
  let page = 1;
  let hasMorePages = true;

  // Buscar comentários de revisão de código (comentários em linhas específicas)
  while (hasMorePages) {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
        owner,
        repo,
        pull_number,
        per_page: 100,
        page
      });

      if (response.data.length === 0) {
        hasMorePages = false;
      } else {
        // Formata os comentários para o tipo Comment
        const formattedComments = response.data
          .filter(comment => comment.user !== null) // Filtra comentários sem usuário
          .map(comment => ({
            id: comment.id,
            user: {
              login: comment.user!.login,
              id: comment.user!.id,
              avatar_url: comment.user!.avatar_url,
              html_url: comment.user!.html_url
            },
            body: comment.body || '',
            created_at: comment.created_at || '',
            updated_at: comment.updated_at || '',
            html_url: comment.html_url,
            comment_type: 'pr_line' as const,
            path: comment.path,
            position: comment.position,
            original_position: comment.original_position,
            commit_id: comment.commit_id,
            diff_hunk: comment.diff_hunk,
            in_reply_to_id: comment.in_reply_to_id
          }));

        comments.push(...formattedComments);
        page++;
      }
    } catch (error) {
      console.error(`Erro ao buscar comentários do PR #${pull_number}:`, error);
      hasMorePages = false;
    }
  }

  // Também busca comentários de issues (que incluem comentários gerais do PR)
  let issuePage = 1;
  let hasMoreIssuePages = true;

  while (hasMoreIssuePages) {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo,
        issue_number: pull_number,
        per_page: 100,
        page: issuePage
      });

      if (response.data.length === 0) {
        hasMoreIssuePages = false;
      } else {
        // Formata os comentários para o tipo Comment
        const formattedComments = response.data
          .filter(comment => comment.user !== null) // Filtra comentários sem usuário
          .map(comment => ({
            id: comment.id,
            user: {
              login: comment.user!.login,
              id: comment.user!.id,
              avatar_url: comment.user!.avatar_url,
              html_url: comment.user!.html_url
            },
            body: comment.body || '',
            created_at: comment.created_at || '',
            updated_at: comment.updated_at || '',
            html_url: comment.html_url,
            comment_type: 'issue' as const
          }));

        comments.push(...formattedComments);
        issuePage++;
      }
    } catch (error) {
      console.error(`Erro ao buscar comentários de issue do PR #${pull_number}:`, error);
      hasMoreIssuePages = false;
    }
  }

  // Buscar comentários de revisão (PR reviews)
  try {
    const reviews = await fetchPullRequestReviews(octokit, owner, repo, pull_number);

    // Extrair comentários dos reviews
    const reviewComments = reviews
      .filter(review => review.body && review.body.trim() !== '')
      .map(review => ({
        id: review.id,
        user: review.user,
        body: review.body || '',
        created_at: review.submitted_at,
        updated_at: review.submitted_at,
        html_url: review.html_url,
        comment_type: 'pr_review' as const
      }));

    comments.push(...reviewComments);
  } catch (error) {
    console.error(`Erro ao processar comentários de review do PR #${pull_number}:`, error);
  }

  return comments;
}

// Função para buscar solicitações de revisão
async function fetchReviewRequests(octokit: Octokit, owner: string, repo: string, pull_number: number): Promise<ReviewRequest[]> {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
      owner,
      repo,
      pull_number
    });

    // Converte para o formato ReviewRequest
    return response.data.users.map(user => ({
      user: {
        login: user.login,
        id: user.id,
        avatar_url: user.avatar_url,
        html_url: user.html_url
      },
      // Infelizmente, a API do GitHub não fornece a data em que a revisão foi solicitada
      requested_at: undefined
    }));
  } catch (error) {
    console.warn(`Não foi possível obter solicitações de revisão para o PR #${pull_number}`);
    return [];
  }
}

// Executa a função principal
main().catch(error => {
  console.error('Erro não tratado:', error);
  process.exit(1);
});