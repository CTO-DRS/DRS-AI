export interface AppBuildRequest {
  id: string;
  userId: string;
  description: string;
  name: string;
  type: AppType;
  techStack: TechStack;
  features: FeatureRequest[];
  design: DesignPreferences;
  config: BuildConfig;
  status: BuildStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  outputPath?: string;
  error?: string;
}

export enum AppType {
  WEB_APP = 'web_app',
  MOBILE_APP = 'mobile_app',
  DESKTOP_APP = 'desktop_app',
  API = 'api',
  CLI = 'cli',
  CHATBOT = 'chatbot',
  DASHBOARD = 'dashboard',
  LANDING_PAGE = 'landing_page',
  E_COMMERCE = 'e_commerce',
  BLOG = 'blog',
  PORTFOLIO = 'portfolio',
  SAAS = 'saas'
}

export interface TechStack {
  frontend?: FrontendStack;
  backend?: BackendStack;
  database?: DatabaseStack;
  styling?: StylingStack;
  stateManagement?: StateManagement;
  deployment?: DeploymentTarget;
}

export interface FrontendStack {
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'nextjs' | 'nuxt' | 'solid';
  language: 'typescript' | 'javascript';
  uiLibrary?: 'shadcn' | 'mui' | 'antd' | 'chakra' | 'tailwind';
}

export interface BackendStack {
  framework: 'express' | 'fastify' | 'nest' | 'fastapi' | 'django' | 'flask' | 'spring';
  language: 'typescript' | 'javascript' | 'python' | 'java' | 'go';
  authentication?: 'jwt' | 'oauth' | 'session' | 'none';
}

export interface DatabaseStack {
  type: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite' | 'redis' | 'supabase' | 'firebase';
  orm?: 'prisma' | 'typeorm' | 'sequelize' | 'mongoose' | 'drizzle';
}

export interface StylingStack {
  framework: 'tailwind' | 'styled-components' | 'sass' | 'css-modules' | 'emotion';
  theme?: 'light' | 'dark' | 'both';
}

export interface StateManagement {
  solution: 'redux' | 'zustand' | 'context' | 'mobx' | 'recoil' | 'pinia' | 'none';
}

export interface DeploymentTarget {
  platform: 'vercel' | 'netlify' | 'docker' | 'aws' | 'gcp' | 'azure' | 'self-hosted';
  ci?: boolean;
}

export interface FeatureRequest {
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  type: FeatureType;
  config?: Record<string, any>;
}

export enum FeatureType {
  AUTH = 'auth',
  CRUD = 'crud',
  SEARCH = 'search',
  FILTER = 'filter',
  SORT = 'sort',
  PAGINATION = 'pagination',
  UPLOAD = 'upload',
  EXPORT = 'export',
  IMPORT = 'import',
  NOTIFICATION = 'notification',
  REALTIME = 'realtime',
  ANALYTICS = 'analytics',
  PAYMENT = 'payment',
  CHAT = 'chat',
  COMMENTS = 'comments',
  RATINGS = 'ratings',
  SOCIAL = 'social',
  SEO = 'seo',
  I18N = 'i18n',
  THEME = 'theme',
  CUSTOM = 'custom'
}

export interface DesignPreferences {
  style: 'modern' | 'minimal' | 'corporate' | 'creative' | 'playful';
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  layout: 'sidebar' | 'topbar' | 'bottom-nav' | 'none';
  responsive: boolean;
  animations: boolean;
  darkMode: boolean;
}

export interface BuildConfig {
  includeTests: boolean;
  includeDocs: boolean;
  includeDocker: boolean;
  includeCI: boolean;
  includeStorybook: boolean;
  includeESLint: boolean;
  includePrettier: boolean;
  includeHusky: boolean;
}

export enum BuildStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  PLANNING = 'planning',
  GENERATING = 'generating',
  BUILDING = 'building',
  TESTING = 'testing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface BuildPlan {
  requestId: string;
  steps: BuildStep[];
  estimatedTime: number;
  dependencies: string[];
  fileStructure: FileNode[];
}

export interface BuildStep {
  id: string;
  name: string;
  description: string;
  type: StepType;
  dependencies: string[];
  estimatedTime: number;
  status: StepStatus;
  output?: string;
  error?: string;
}

export enum StepType {
  ANALYSIS = 'analysis',
  SCAFFOLD = 'scaffold',
  GENERATE = 'generate',
  INSTALL = 'install',
  CONFIGURE = 'configure',
  BUILD = 'build',
  TEST = 'test',
  PACKAGE = 'package'
}

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  content?: string;
  template?: string;
  children?: FileNode[];
}

export interface GeneratedCode {
  filePath: string;
  content: string;
  language: string;
  description: string;
}

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  type: AppType;
  techStack: TechStack;
  structure: FileNode[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface BuildResult {
  requestId: string;
  success: boolean;
  outputPath: string;
  files: string[];
  warnings: string[];
  errors: string[];
  metrics: BuildMetrics;
  downloadUrl?: string;
}

export interface BuildMetrics {
  totalFiles: number;
  totalLines: number;
  generationTime: number;
  buildTime: number;
  testResults?: TestResults;
}

export interface TestResults {
  passed: number;
  failed: number;
  skipped: number;
  coverage?: number;
}

export interface CodeReview {
  filePath: string;
  issues: CodeIssue[];
  suggestions: string[];
  quality: CodeQuality;
}

export interface CodeIssue {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
}

export interface CodeQuality {
  score: number;
  maintainability: number;
  reliability: number;
  security: number;
  performance: number;
}

export interface NaturalLanguageInput {
  description: string;
  constraints?: string[];
  preferences?: Record<string, any>;
}

export interface ParsedRequirements {
  appType: AppType;
  features: FeatureRequest[];
  techStack: Partial<TechStack>;
  design: Partial<DesignPreferences>;
  entities: EntityDefinition[];
  pages: PageDefinition[];
}

export interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  relations: RelationDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  validations?: ValidationRule[];
}

export interface ValidationRule {
  type: string;
  value?: any;
  message: string;
}

export interface RelationDefinition {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  target: string;
  field: string;
}

export interface PageDefinition {
  name: string;
  route: string;
  components: ComponentDefinition[];
  dataRequirements: DataRequirement[];
}

export interface ComponentDefinition {
  name: string;
  type: 'page' | 'layout' | 'component' | 'hook' | 'util';
  props: PropDefinition[];
  state?: StateDefinition[];
  children?: ComponentDefinition[];
}

export interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  default?: any;
}

export interface StateDefinition {
  name: string;
  type: string;
  initialValue?: any;
}

export interface DataRequirement {
  source: string;
  method: 'get' | 'post' | 'put' | 'delete';
  endpoint: string;
  params?: string[];
}
