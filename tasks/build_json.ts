import { Octokit } from 'octokit';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Obter o diretório atual em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório para armazenar os arquivos de cache
const CACHE_DIR = path.join(__dirname, 'cache');

// Certifica-se de que o diretório de cache existe
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Função para gerar um hash único para uma requisição
function generateCacheKey(method: string, url: string, params: any): string {
  const data = JSON.stringify({ method, url, params });
  return crypto.createHash('md5').update(data).digest('hex');
}

// Função para verificar se um cache existe e está válido
function getCachedData<T>(cacheKey: string, ttlDays: number = 1, forceCache: boolean = false): T | null {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);

  if (fs.existsSync(cachePath)) {
    // Se forceCache for true, ignora a verificação de TTL
    if (forceCache) {
      try {
        const data = fs.readFileSync(cachePath, 'utf8');
        return JSON.parse(data) as T;
      } catch (error) {
        console.warn(`Erro ao ler cache ${cachePath}:`, error);
        return null;
      }
    }

    const stats = fs.statSync(cachePath);
    const cacheAge = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24); // Idade em dias

    if (cacheAge <= ttlDays) {
      try {
        const data = fs.readFileSync(cachePath, 'utf8');
        return JSON.parse(data) as T;
      } catch (error) {
        console.warn(`Erro ao ler cache ${cachePath}:`, error);
        return null;
      }
    }
  }

  return null;
}

// Função para salvar dados no cache
function saveCacheData(cacheKey: string, data: any): void {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn(`Erro ao salvar cache ${cachePath}:`, error);
  }
}

// Wrapper para requisições da API do GitHub com cache
async function cachedRequest<T>(
  octokit: Octokit,
  method: string,
  url: string,
  params: any,
  ttlDays: number = 1,
  retryCount: number = 0,
  forceCache: boolean = false
): Promise<T> {
  const cacheKey = generateCacheKey(method, url, params);
  const cachedData = getCachedData<T>(cacheKey, ttlDays, forceCache);

  if (cachedData) {
    console.log(`[CACHE] Usando dados em cache para ${method} ${url}`);
    return cachedData;
  }

  // Se forceCache for true e não encontrou cache, lança um erro
  if (forceCache) {
    throw new Error(`Cache forçado, mas não encontrado para ${method} ${url}`);
  }

  try {
    console.log(`[API] Fazendo requisição para ${method} ${url}`);
    const response = await octokit.request(`${method} ${url}`, params);
    saveCacheData(cacheKey, response.data);

    return response.data as T;
  } catch (error: any) {
    // Verifica se é um erro de limite de requisições
    if (error.status === 403 && error.message.includes('API rate limit exceeded')) {
      if (retryCount >= 3) {
        throw new Error(`Limite de tentativas excedido para ${method} ${url}: ${error.message}`);
      }

      // Calcula o tempo de espera baseado no número de tentativas (exponential backoff)
      const waitTime = Math.pow(2, retryCount) * 30000; // 30s, 60s, 120s
      console.warn(`[RATE LIMIT] Limite de requisições atingido. Aguardando ${waitTime / 1000}s antes de tentar novamente...`);

      // Espera antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Tenta novamente com contador incrementado
      return cachedRequest(octokit, method, url, params, ttlDays, retryCount + 1, forceCache);
    }

    // Se for um erro de quota esgotada para o endpoint específico
    if (error.message && error.message.includes('Request quota exhausted')) {
      if (retryCount >= 3) {
        throw new Error(`Limite de tentativas excedido para ${method} ${url}: ${error.message}`);
      }

      // Aguarda um tempo maior para endpoints com quota específica
      const waitTime = Math.pow(2, retryCount) * 60000; // 60s, 120s, 240s
      console.warn(`[QUOTA] Quota esgotada para o endpoint. Aguardando ${waitTime / 1000}s antes de tentar novamente...`);

      await new Promise(resolve => setTimeout(resolve, waitTime));

      return cachedRequest(octokit, method, url, params, ttlDays, retryCount + 1, forceCache);
    }

    // Para outros erros, lança a exceção
    throw error;
  }
}

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
  pull_requests: PullRequest[];
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

    // Verifica se a opção de forçar cache foi fornecida
    const forceCache = args.includes('--force-cache');
    if (forceCache) {
      console.log('Modo de cache forçado ativado. Apenas dados em cache serão usados.');
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
    const repositories = await fetchRepositories(octokit, org, forceCache);
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

    // Processa cada repositório
    console.log(`Processando ${repositories.length} repositórios...`);
    for (const repo of repositories) {
      console.log(`\nProcessando repositório: ${repo.name}`);

      // Busca todos os PRs do repositório desde a data de início
      const pullRequests = await fetchAllPullRequests(octokit, org, repo.name, startDateString, forceCache);
      console.log(`Encontrados ${pullRequests.length} PRs desde ${new Date(startDateString).toLocaleDateString()}`);

      if (pullRequests.length === 0) {
        continue;
      }

      // Processa os PRs em lotes para evitar sobrecarregar a API
      console.log(`Processando ${pullRequests.length} PRs em lotes...`);
      const detailedPRs = await processInBatches(pullRequests, 5, async (pr) => {
        return processPR(octokit, org, repo.name, pr, forceCache);
      });

      // Atualiza o objeto de dados com os PRs deste repositório
      data.repositories[repo.name] = {
        repository: repo,
        pull_requests: detailedPRs
      };

      // Atualiza estatísticas
      data.summary.total_commits += detailedPRs.reduce((total, pr) => total + pr.commits.length, 0);
      data.summary.total_comments += detailedPRs.reduce((total, pr) => total + pr.comments.length, 0);
      data.summary.total_reviews += detailedPRs.reduce((total, pr) => total + pr.reviews.length, 0);
      data.summary.total_review_requests += detailedPRs.reduce((total, pr) => total + pr.review_requests.length, 0);
      data.summary.total_additions += detailedPRs.reduce((total, pr) => total + (pr.additions || 0), 0);
      data.summary.total_deletions += detailedPRs.reduce((total, pr) => total + (pr.deletions || 0), 0);
      data.summary.total_changed_files += detailedPRs.reduce((total, pr) => total + pr.changed_files, 0);

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

// Função para buscar todos os repositórios da organização
async function fetchRepositories(octokit: Octokit, org: string, forceCache: boolean = false): Promise<Repository[]> {
  const repositories: Repository[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const data = await cachedRequest<any[]>(
        octokit,
        'GET',
        '/orgs/{org}/repos',
        {
          org,
          type: 'all',
          per_page: 100,
          page
        },
        7, // Cache válido por 7 dias para repositórios
        0,  // Contador de tentativas
        forceCache // Usar cache forçado
      );

      if (data.length === 0) {
        hasMorePages = false;
      } else {
        // Formata os repositórios para o tipo Repository
        data.forEach(repo => {
          // Formata a licença, se existir
          let formattedLicense: { key: string; name: string; spdx_id: string; url: string; } | null = null;
          if (repo.license) {
            formattedLicense = {
              key: repo.license.key || '',
              name: repo.license.name || '',
              spdx_id: repo.license.spdx_id || '',
              url: repo.license.url || ''
            };
          }

          repositories.push({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            html_url: repo.html_url,
            description: repo.description,
            fork: repo.fork,
            created_at: repo.created_at,
            updated_at: repo.updated_at,
            pushed_at: repo.pushed_at,
            homepage: repo.homepage,
            size: repo.size,
            stargazers_count: repo.stargazers_count,
            watchers_count: repo.watchers_count,
            language: repo.language,
            forks_count: repo.forks_count,
            archived: repo.archived,
            disabled: repo.disabled,
            open_issues_count: repo.open_issues_count,
            license: formattedLicense,
            topics: repo.topics || [],
            visibility: repo.visibility || 'public',
            default_branch: repo.default_branch || 'main',
            pull_requests: []
          });
        });

        page++;
      }
    } catch (error) {
      console.error(`Erro ao buscar repositórios da página ${page}:`, error);
      hasMorePages = false;
    }
  }

  return repositories;
}

// Função para buscar todos os PRs de um repositório desde uma data específica
async function fetchAllPullRequests(octokit: Octokit, owner: string, repo: string, since: string, forceCache: boolean = false): Promise<any[]> {
  const allPullRequests: any[] = [];
  let page = 1;
  const perPage = 100;
  let hasMorePages = true;
  const pagePromises: Promise<any[]>[] = [];

  // Primeiro, descobrimos quantas páginas existem
  while (hasMorePages) {
    try {
      const data = await cachedRequest<any[]>(
        octokit,
        'GET',
        '/repos/{owner}/{repo}/pulls',
        {
          owner,
          repo,
          state: 'all',
          sort: 'created',
          direction: 'desc',
          per_page: perPage,
          page
        },
        3, // Cache válido por 3 dias para PRs
        0,  // Contador de tentativas
        forceCache // Usar cache forçado
      );

      // Se não há mais PRs ou chegamos a PRs anteriores à data de início, paramos
      if (data.length === 0) {
        hasMorePages = false;
        break;
      }

      // Verifica se o último PR da página é anterior à data de início
      const lastPRDate = new Date(data[data.length - 1].created_at);
      if (lastPRDate < new Date(since)) {
        // Adiciona apenas os PRs que são posteriores à data de início
        const filteredPRs = data.filter(pr => new Date(pr.created_at) >= new Date(since));
        allPullRequests.push(...filteredPRs);
        hasMorePages = false;
        break;
      }

      // Adiciona a promessa para buscar esta página
      pagePromises.push(Promise.resolve(data));

      page++;
    } catch (error) {
      console.error(`Erro ao buscar PRs da página ${page} para ${owner}/${repo}:`, error);
      hasMorePages = false;
    }
  }

  // Processa todas as páginas em paralelo
  const results = await Promise.all(pagePromises);
  results.forEach(pageData => {
    // Filtra apenas os PRs que são posteriores à data de início
    const filteredPRs = pageData.filter(pr => new Date(pr.created_at) >= new Date(since));
    allPullRequests.push(...filteredPRs);
  });

  return allPullRequests;
}

// Função para formatar um PR da API para o formato usado no JSON
async function formatPullRequest(octokit: Octokit, owner: string, repo: string, pr: any): Promise<PullRequest> {
  // Busca detalhes adicionais do PR para obter additions, deletions e changed_files
  let additions = 0;
  let deletions = 0;
  let changed_files = 0;

  try {
    // Busca detalhes completos do PR para obter estatísticas
    const detailedPR = await octokit.rest.pulls.get({
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

  return {
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
}

// Função para buscar detalhes de um PR
async function fetchPullRequestDetails(octokit: Octokit, owner: string, repo: string, pull_number: number, forceCache: boolean = false): Promise<PullRequest> {
  try {
    const data = await cachedRequest<any>(
      octokit,
      'GET',
      '/repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner,
        repo,
        pull_number
      },
      7, // Cache válido por 7 dias para detalhes de PR
      0,  // Contador de tentativas
      forceCache // Usar cache forçado
    );

    // Formata o PR para o tipo PullRequest
    const formattedPR: PullRequest = {
      id: data.id,
      number: data.number,
      title: data.title,
      user: {
        login: data.user?.login || 'unknown',
        id: data.user?.id || 0,
        avatar_url: data.user?.avatar_url || '',
        html_url: data.user?.html_url || ''
      },
      state: data.state as 'open' | 'closed',
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at,
      merged_at: data.merged_at,
      merge_commit_sha: data.merge_commit_sha,
      assignees: (data.assignees || []).map(assignee => ({
        login: assignee.login,
        id: assignee.id,
        avatar_url: assignee.avatar_url,
        html_url: assignee.html_url
      })),
      requested_reviewers: (data.requested_reviewers || []).map(reviewer => ({
        login: reviewer.login,
        id: reviewer.id,
        avatar_url: reviewer.avatar_url,
        html_url: reviewer.html_url
      })),
      labels: (data.labels || []).map(label => ({
        id: typeof label.id === 'number' ? label.id : 0,
        name: label.name,
        color: label.color || '',
        description: label.description || ''
      })),
      draft: data.draft || false,
      head: {
        ref: data.head.ref,
        sha: data.head.sha,
        repo: {
          id: data.head.repo?.id || 0,
          name: data.head.repo?.name || '',
          full_name: data.head.repo?.full_name || '',
          html_url: data.head.repo?.html_url || ''
        }
      },
      base: {
        ref: data.base.ref,
        sha: data.base.sha,
        repo: {
          id: data.base.repo?.id || 0,
          name: data.base.repo?.name || '',
          full_name: data.base.repo?.full_name || '',
          html_url: data.base.repo?.html_url || ''
        }
      },
      html_url: data.html_url,
      commits: [],
      reviews: [],
      review_requests: [],
      comments: [],
      additions: data.additions || 0,
      deletions: data.deletions || 0,
      changed_files: data.changed_files || 0
    };

    return formattedPR;
  } catch (error) {
    console.error(`Erro ao buscar detalhes do PR #${pull_number} para ${owner}/${repo}:`, error);
    throw error;
  }
}

// Função para buscar commits de um PR
async function fetchPullRequestCommits(octokit: Octokit, owner: string, repo: string, pull_number: number, forceCache: boolean = false): Promise<Commit[]> {
  const commits: Commit[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const data = await cachedRequest<any[]>(
        octokit,
        'GET',
        '/repos/{owner}/{repo}/pulls/{pull_number}/commits',
        {
          owner,
          repo,
          pull_number,
          per_page: 100,
          page
        },
        7, // Cache válido por 7 dias para commits
        0,  // Contador de tentativas
        forceCache // Usar cache forçado
      );

      if (data.length === 0) {
        hasMorePages = false;
      } else {
        // Para cada commit, busca estatísticas detalhadas
        for (const apiCommit of data) {
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
    } catch (error) {
      console.error(`Erro ao buscar commits do PR #${pull_number} para ${owner}/${repo}:`, error);
      hasMorePages = false;
    }
  }

  return commits;
}

// Função para buscar reviews de um PR
async function fetchPullRequestReviews(octokit: Octokit, owner: string, repo: string, pull_number: number, forceCache: boolean = false): Promise<Review[]> {
  const reviews: Review[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const data = await cachedRequest<any[]>(
        octokit,
        'GET',
        '/repos/{owner}/{repo}/pulls/{pull_number}/reviews',
        {
          owner,
          repo,
          pull_number,
          per_page: 100,
          page
        },
        7, // Cache válido por 7 dias para reviews
        0,  // Contador de tentativas
        forceCache // Usar cache forçado
      );

      if (data.length === 0) {
        hasMorePages = false;
      } else {
        // Formata os reviews para o tipo Review
        const formattedReviews = data
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
    } catch (error) {
      console.error(`Erro ao buscar reviews do PR #${pull_number} para ${owner}/${repo}:`, error);
      hasMorePages = false;
    }
  }

  return reviews;
}

// Função para buscar comentários de um PR
async function fetchPullRequestComments(octokit: Octokit, owner: string, repo: string, pull_number: number, forceCache: boolean = false): Promise<Comment[]> {
  const comments: Comment[] = [];
  let page = 1;
  let hasMorePages = true;

  // Buscar comentários de revisão de código (comentários em linhas específicas)
  while (hasMorePages) {
    try {
      const data = await cachedRequest<any[]>(
        octokit,
        'GET',
        '/repos/{owner}/{repo}/pulls/{pull_number}/comments',
        {
          owner,
          repo,
          pull_number,
          per_page: 100,
          page
        },
        7, // Cache válido por 7 dias para comentários
        0,  // Contador de tentativas
        forceCache // Usar cache forçado
      );

      if (data.length === 0) {
        hasMorePages = false;
      } else {
        // Formata os comentários para o tipo Comment
        const formattedComments = data
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
      console.error(`Erro ao buscar comentários de revisão do PR #${pull_number} para ${owner}/${repo}:`, error);
      hasMorePages = false;
    }
  }

  // Buscar comentários de issue (comentários gerais no PR)
  page = 1;
  hasMorePages = true;
  while (hasMorePages) {
    try {
      const data = await cachedRequest<any[]>(
        octokit,
        'GET',
        '/repos/{owner}/{repo}/issues/{issue_number}/comments',
        {
          owner,
          repo,
          issue_number: pull_number,
          per_page: 100,
          page
        },
        7, // Cache válido por 7 dias para comentários de issue
        0,  // Contador de tentativas
        forceCache // Usar cache forçado
      );

      if (data.length === 0) {
        hasMorePages = false;
      } else {
        // Formata os comentários para o tipo Comment
        const formattedComments = data
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
        page++;
      }
    } catch (error) {
      console.error(`Erro ao buscar comentários de issue do PR #${pull_number} para ${owner}/${repo}:`, error);
      hasMorePages = false;
    }
  }

  // Extrair comentários de revisão
  const reviews = await fetchPullRequestReviews(octokit, owner, repo, pull_number, forceCache);
  const reviewComments = reviews
    .filter(review => review.body !== null && review.body !== '')
    .map(review => ({
      id: review.id,
      user: review.user,
      body: review.body,
      created_at: review.submitted_at,
      updated_at: review.submitted_at,
      html_url: review.html_url,
      comment_type: 'pr_review' as const
    }));

  comments.push(...reviewComments);

  return comments;
}

// Função para buscar solicitações de revisão de um PR
async function fetchReviewRequests(octokit: Octokit, owner: string, repo: string, pull_number: number, forceCache: boolean = false): Promise<ReviewRequest[]> {
  try {
    const data = await cachedRequest<any>(
      octokit,
      'GET',
      '/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
      {
        owner,
        repo,
        pull_number
      },
      7, // Cache válido por 7 dias
      0,  // Contador de tentativas
      forceCache // Usar cache forçado
    );

    // Formata as solicitações de revisão
    const reviewRequests: ReviewRequest[] = [];

    // Adiciona os usuários solicitados
    if (data.users && Array.isArray(data.users)) {
      data.users.forEach((user: any) => {
        if (user) {
          reviewRequests.push({
            user: {
              login: user.login,
              id: user.id,
              avatar_url: user.avatar_url,
              html_url: user.html_url
            }
          });
        }
      });
    }

    return reviewRequests;
  } catch (error) {
    console.error(`Erro ao buscar solicitações de revisão do PR #${pull_number} para ${owner}/${repo}:`, error);
    return [];
  }
}

// Função para processar um PR
async function processPR(octokit: Octokit, org: string, repo: string, pr: any, forceCache: boolean = false): Promise<PullRequest> {
  try {
    console.log(`  Processando PR #${pr.number}: ${pr.title}`);

    // Busca detalhes do PR
    const detailedPR = await fetchPullRequestDetails(octokit, org, repo, pr.number, forceCache);

    // Busca commits, reviews, comentários e solicitações de revisão em paralelo
    const [commits, reviews, comments, reviewRequests] = await Promise.all([
      fetchPullRequestCommits(octokit, org, repo, pr.number, forceCache),
      fetchPullRequestReviews(octokit, org, repo, pr.number, forceCache),
      fetchPullRequestComments(octokit, org, repo, pr.number, forceCache),
      fetchReviewRequests(octokit, org, repo, pr.number, forceCache)
    ]);

    // Adiciona os dados ao PR
    detailedPR.commits = commits;
    detailedPR.reviews = reviews;
    detailedPR.comments = comments;
    detailedPR.review_requests = reviewRequests;

    return detailedPR;
  } catch (error) {
    console.error(`Erro ao processar PR #${pr.number}:`, error);
    throw error;
  }
}

// Função para processar PRs em lotes paralelos
async function processInBatches<T, R>(items: T[], batchSize: number, processFunction: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];

  // Processa os itens em lotes
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`  Processando lote ${i / batchSize + 1} de ${Math.ceil(items.length / batchSize)} (${batch.length} itens)`);

    // Processa o lote atual em paralelo
    const batchResults = await Promise.all(batch.map(processFunction));
    results.push(...batchResults);
  }

  return results;
}

// Executa a função principal
main().catch(error => {
  console.error('Erro não tratado:', error);
  process.exit(1);
});