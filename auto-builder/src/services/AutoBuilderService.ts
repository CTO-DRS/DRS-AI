import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import Handlebars from 'handlebars';
import archiver from 'archiver';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  AppBuildRequest,
  AppType,
  TechStack,
  FeatureRequest,
  FeatureType,
  DesignPreferences,
  BuildConfig,
  BuildStatus,
  BuildPlan,
  BuildStep,
  StepType,
  StepStatus,
  FileNode,
  GeneratedCode,
  BuildResult,
  BuildMetrics,
  ParsedRequirements,
  EntityDefinition,
  PageDefinition,
  ComponentDefinition
} from '../types';
import { Logger } from '../utils/logger';
import { templates } from '../templates';

export class AutoBuilderService {
  private redis: Redis;
  private buildQueue: Queue;
  private logger: Logger;
  private outputDir: string;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });

    this.buildQueue = new Queue('app-build', { connection: this.redis });
    this.logger = new Logger('AutoBuilderService');
    this.outputDir = process.env.BUILD_OUTPUT_DIR || '/app/builds';

    // Register Handlebars helpers
    this.registerHelpers();
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.outputDir);
    this.logger.info('Auto Builder Service initialized');
  }

  async createBuildRequest(
    userId: string,
    description: string,
    options: {
      name?: string;
      type?: AppType;
      techStack?: Partial<TechStack>;
      features?: FeatureRequest[];
      design?: Partial<DesignPreferences>;
      config?: Partial<BuildConfig>;
    } = {}
  ): Promise<AppBuildRequest> {
    const request: AppBuildRequest = {
      id: uuidv4(),
      userId,
      description,
      name: options.name || `app-${Date.now()}`,
      type: options.type || AppType.WEB_APP,
      techStack: this.inferTechStack(options.techStack),
      features: options.features || [],
      design: this.inferDesignPreferences(options.design),
      config: this.getDefaultBuildConfig(options.config),
      status: BuildStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Parse requirements from description
    const requirements = await this.parseRequirements(description);
    request.type = requirements.appType;
    request.features = [...request.features, ...requirements.features];
    request.techStack = { ...request.techStack, ...requirements.techStack };
    request.design = { ...request.design, ...requirements.design };

    // Store request
    await this.redis.setex(
      `build:${request.id}`,
      86400,
      JSON.stringify(request)
    );

    // Queue build job
    await this.buildQueue.add('build-app', {
      requestId: request.id,
      userId
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    this.logger.info(`Build request created: ${request.id}`);
    return request;
  }

  async parseRequirements(description: string): Promise<ParsedRequirements> {
    // Use LLM to parse requirements
    const prompt = `
      Analyze the following app description and extract structured requirements:
      
      Description: "${description}"
      
      Extract and return JSON with:
      1. App type (web_app, mobile_app, api, dashboard, etc.)
      2. Key features needed
      3. Recommended tech stack
      4. Design preferences
      5. Data entities
      6. Pages/screens needed
      
      Return ONLY valid JSON.
    `;

    try {
      const response = await this.callLLM(prompt);
      const parsed = JSON.parse(response);

      return {
        appType: parsed.appType || AppType.WEB_APP,
        features: parsed.features || [],
        techStack: parsed.techStack || {},
        design: parsed.design || {},
        entities: parsed.entities || [],
        pages: parsed.pages || []
      };
    } catch (error) {
      this.logger.error('Failed to parse requirements:', error);
      return this.getDefaultRequirements();
    }
  }

  async generateBuildPlan(request: AppBuildRequest): Promise<BuildPlan> {
    const steps: BuildStep[] = [];

    // Step 1: Analysis
    steps.push({
      id: 'analysis',
      name: 'Requirements Analysis',
      description: 'Analyzing requirements and planning architecture',
      type: StepType.ANALYSIS,
      dependencies: [],
      estimatedTime: 30000,
      status: StepStatus.PENDING
    });

    // Step 2: Scaffold
    steps.push({
      id: 'scaffold',
      name: 'Project Scaffolding',
      description: 'Creating project structure and configuration',
      type: StepType.SCAFFOLD,
      dependencies: ['analysis'],
      estimatedTime: 60000,
      status: StepStatus.PENDING
    });

    // Step 3: Generate components
    steps.push({
      id: 'generate-components',
      name: 'Generate Components',
      description: 'Generating React/Vue components',
      type: StepType.GENERATE,
      dependencies: ['scaffold'],
      estimatedTime: 120000,
      status: StepStatus.PENDING
    });

    // Step 4: Generate pages
    steps.push({
      id: 'generate-pages',
      name: 'Generate Pages',
      description: 'Generating page components',
      type: StepType.GENERATE,
      dependencies: ['generate-components'],
      estimatedTime: 90000,
      status: StepStatus.PENDING
    });

    // Step 5: Generate API
    if (request.techStack.backend) {
      steps.push({
        id: 'generate-api',
        name: 'Generate API',
        description: 'Generating backend API endpoints',
        type: StepType.GENERATE,
        dependencies: ['scaffold'],
        estimatedTime: 120000,
        status: StepStatus.PENDING
      });
    }

    // Step 6: Generate database
    if (request.techStack.database) {
      steps.push({
        id: 'generate-db',
        name: 'Generate Database Schema',
        description: 'Generating database schema and migrations',
        type: StepType.GENERATE,
        dependencies: ['scaffold'],
        estimatedTime: 60000,
        status: StepStatus.PENDING
      });
    }

    // Step 7: Install dependencies
    steps.push({
      id: 'install',
      name: 'Install Dependencies',
      description: 'Installing npm/pip packages',
      type: StepType.INSTALL,
      dependencies: ['generate-components', 'generate-pages', 'generate-api', 'generate-db'],
      estimatedTime: 180000,
      status: StepStatus.PENDING
    });

    // Step 8: Configure
    steps.push({
      id: 'configure',
      name: 'Configure Project',
      description: 'Setting up configuration files',
      type: StepType.CONFIGURE,
      dependencies: ['install'],
      estimatedTime: 30000,
      status: StepStatus.PENDING
    });

    // Step 9: Build
    steps.push({
      id: 'build',
      name: 'Build Application',
      description: 'Building the application',
      type: StepType.BUILD,
      dependencies: ['configure'],
      estimatedTime: 120000,
      status: StepStatus.PENDING
    });

    // Step 10: Test (if enabled)
    if (request.config.includeTests) {
      steps.push({
        id: 'test',
        name: 'Run Tests',
        description: 'Running test suite',
        type: StepType.TEST,
        dependencies: ['build'],
        estimatedTime: 60000,
        status: StepStatus.PENDING
      });
    }

    // Step 11: Package
    steps.push({
      id: 'package',
      name: 'Package Application',
      description: 'Creating deployment package',
      type: StepType.PACKAGE,
      dependencies: request.config.includeTests ? ['test'] : ['build'],
      estimatedTime: 30000,
      status: StepStatus.PENDING
    });

    const totalTime = steps.reduce((sum, step) => sum + step.estimatedTime, 0);

    return {
      requestId: request.id,
      steps,
      estimatedTime: totalTime,
      dependencies: this.extractDependencies(steps),
      fileStructure: await this.generateFileStructure(request)
    };
  }

  async executeBuild(request: AppBuildRequest): Promise<BuildResult> {
    const startTime = Date.now();
    const outputPath = path.join(this.outputDir, request.id);

    try {
      // Update status
      await this.updateBuildStatus(request.id, BuildStatus.GENERATING);

      // Create output directory
      await fs.ensureDir(outputPath);

      // Generate build plan
      const plan = await this.generateBuildPlan(request);

      // Execute each step
      const generatedFiles: string[] = [];

      for (const step of plan.steps) {
        await this.updateStepStatus(request.id, step.id, StepStatus.RUNNING);

        try {
          switch (step.type) {
            case StepType.SCAFFOLD:
              await this.scaffoldProject(request, outputPath);
              break;
            case StepType.GENERATE:
              const files = await this.generateCode(request, step, outputPath);
              generatedFiles.push(...files);
              break;
            case StepType.CONFIGURE:
              await this.configureProject(request, outputPath);
              break;
            case StepType.BUILD:
              await this.buildProject(request, outputPath);
              break;
            case StepType.PACKAGE:
              await this.packageProject(request, outputPath);
              break;
          }

          await this.updateStepStatus(request.id, step.id, StepStatus.COMPLETED);
        } catch (error) {
          await this.updateStepStatus(request.id, step.id, StepStatus.FAILED, error as Error);
          throw error;
        }
      }

      // Update final status
      await this.updateBuildStatus(request.id, BuildStatus.COMPLETED, outputPath);

      const buildTime = Date.now() - startTime;

      return {
        requestId: request.id,
        success: true,
        outputPath,
        files: generatedFiles,
        warnings: [],
        errors: [],
        metrics: {
          totalFiles: generatedFiles.length,
          totalLines: await this.countLines(outputPath),
          generationTime: buildTime,
          buildTime
        },
        downloadUrl: `/api/builds/${request.id}/download`
      };
    } catch (error) {
      await this.updateBuildStatus(request.id, BuildStatus.FAILED, undefined, error as Error);

      return {
        requestId: request.id,
        success: false,
        outputPath,
        files: [],
        warnings: [],
        errors: [(error as Error).message],
        metrics: {
          totalFiles: 0,
          totalLines: 0,
          generationTime: Date.now() - startTime,
          buildTime: 0
        }
      };
    }
  }

  private async scaffoldProject(request: AppBuildRequest, outputPath: string): Promise<void> {
    const { type, techStack } = request;

    // Create base structure
    const structure = this.getProjectStructure(type, techStack);

    for (const node of structure) {
      await this.createFileNode(node, outputPath);
    }

    // Create package.json
    const packageJson = this.generatePackageJson(request);
    await fs.writeJson(path.join(outputPath, 'package.json'), packageJson, { spaces: 2 });

    // Create tsconfig.json if TypeScript
    if (techStack.frontend?.language === 'typescript' || techStack.backend?.language === 'typescript') {
      await fs.writeJson(path.join(outputPath, 'tsconfig.json'), this.getTsConfig(), { spaces: 2 });
    }
  }

  private async generateCode(
    request: AppBuildRequest,
    step: BuildStep,
    outputPath: string
  ): Promise<string[]> {
    const generatedFiles: string[] = [];

    if (step.id === 'generate-components') {
      // Generate UI components
      const components = await this.generateUIComponents(request);
      for (const component of components) {
        const filePath = path.join(outputPath, component.filePath);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, component.content);
        generatedFiles.push(component.filePath);
      }
    } else if (step.id === 'generate-pages') {
      // Generate pages
      const pages = await this.generatePages(request);
      for (const page of pages) {
        const filePath = path.join(outputPath, page.filePath);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, page.content);
        generatedFiles.push(page.filePath);
      }
    } else if (step.id === 'generate-api') {
      // Generate API endpoints
      const endpoints = await this.generateAPIEndpoints(request);
      for (const endpoint of endpoints) {
        const filePath = path.join(outputPath, endpoint.filePath);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, endpoint.content);
        generatedFiles.push(endpoint.filePath);
      }
    } else if (step.id === 'generate-db') {
      // Generate database schema
      const schema = await this.generateDatabaseSchema(request);
      const filePath = path.join(outputPath, 'prisma/schema.prisma');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, schema);
      generatedFiles.push('prisma/schema.prisma');
    }

    return generatedFiles;
  }

  private async generateUIComponents(request: AppBuildRequest): Promise<GeneratedCode[]> {
    const components: GeneratedCode[] = [];
    const { techStack, design } = request;

    // Generate layout component
    const layoutTemplate = templates.components.layout;
    const layoutContent = this.renderTemplate(layoutTemplate, {
      appName: request.name,
      theme: design.theme,
      layout: design.layout
    });
    components.push({
      filePath: 'src/components/Layout.tsx',
      content: layoutContent,
      language: 'typescript',
      description: 'Main layout component'
    });

    // Generate common UI components
    const commonComponents = ['Button', 'Input', 'Card', 'Modal', 'Table', 'Form'];
    for (const componentName of commonComponents) {
      const template = templates.components[componentName.toLowerCase()];
      if (template) {
        const content = this.renderTemplate(template, {
          componentName,
          theme: design.theme
        });
        components.push({
          filePath: `src/components/ui/${componentName}.tsx`,
          content,
          language: 'typescript',
          description: `${componentName} component`
        });
      }
    }

    return components;
  }

  private async generatePages(request: AppBuildRequest): Promise<GeneratedCode[]> {
    const pages: GeneratedCode[] = [];

    // Generate home page
    const homeTemplate = templates.pages.home;
    const homeContent = this.renderTemplate(homeTemplate, {
      appName: request.name,
      description: request.description
    });
    pages.push({
      filePath: 'src/app/page.tsx',
      content: homeContent,
      language: 'typescript',
      description: 'Home page'
    });

    // Generate feature pages based on requirements
    for (const feature of request.features) {
      const pageTemplate = templates.pages[feature.type];
      if (pageTemplate) {
        const content = this.renderTemplate(pageTemplate, {
          feature: feature.name,
          description: feature.description
        });
        pages.push({
          filePath: `src/app/${feature.type}/page.tsx`,
          content,
          language: 'typescript',
          description: `${feature.name} page`
        });
      }
    }

    return pages;
  }

  private async generateAPIEndpoints(request: AppBuildRequest): Promise<GeneratedCode[]> {
    const endpoints: GeneratedCode[] = [];

    // Generate auth endpoints if auth feature exists
    if (request.features.some(f => f.type === FeatureType.AUTH)) {
      const authEndpoints = templates.api.auth;
      endpoints.push({
        filePath: 'src/app/api/auth/route.ts',
        content: authEndpoints,
        language: 'typescript',
        description: 'Authentication endpoints'
      });
    }

    // Generate CRUD endpoints for each entity
    for (const feature of request.features.filter(f => f.type === FeatureType.CRUD)) {
      const crudTemplate = templates.api.crud;
      const content = this.renderTemplate(crudTemplate, {
        entity: feature.name,
        fields: feature.config?.fields || []
      });
      endpoints.push({
        filePath: `src/app/api/${feature.name.toLowerCase()}/route.ts`,
        content,
        language: 'typescript',
        description: `${feature.name} CRUD endpoints`
      });
    }

    return endpoints;
  }

  private async generateDatabaseSchema(request: AppBuildRequest): Promise<string> {
    const { features } = request;
    const entities: string[] = [];

    // Generate entity definitions
    for (const feature of features.filter(f => f.type === FeatureType.CRUD)) {
      const entity = this.generateEntityDefinition(feature);
      entities.push(entity);
    }

    return templates.database.schema.replace('{{entities}}', entities.join('\n\n'));
  }

  private async configureProject(request: AppBuildRequest, outputPath: string): Promise<void> {
    const { config, techStack } = request;

    // ESLint config
    if (config.includeESLint) {
      await fs.writeJson(path.join(outputPath, '.eslintrc.json'), this.getESLintConfig(), { spaces: 2 });
    }

    // Prettier config
    if (config.includePrettier) {
      await fs.writeJson(path.join(outputPath, '.prettierrc'), this.getPrettierConfig(), { spaces: 2 });
    }

    // Docker config
    if (config.includeDocker) {
      await fs.writeFile(path.join(outputPath, 'Dockerfile'), templates.docker.file);
      await fs.writeFile(path.join(outputPath, 'docker-compose.yml'), templates.docker.compose);
    }

    // CI config
    if (config.includeCI) {
      await fs.ensureDir(path.join(outputPath, '.github/workflows'));
      await fs.writeFile(
        path.join(outputPath, '.github/workflows/ci.yml'),
        templates.ci.github
      );
    }

    // Environment config
    await fs.writeFile(path.join(outputPath, '.env.example'), this.generateEnvExample(request));
  }

  private async buildProject(request: AppBuildRequest, outputPath: string): Promise<void> {
    // This would run actual build commands
    // For now, just validate the structure
    const requiredFiles = ['package.json'];
    for (const file of requiredFiles) {
      const filePath = path.join(outputPath, file);
      if (!(await fs.pathExists(filePath))) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
  }

  private async packageProject(request: AppBuildRequest, outputPath: string): Promise<void> {
    const archivePath = path.join(this.outputDir, `${request.id}.zip`);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(outputPath, false);
      archive.finalize();
    });
  }

  // Helper methods

  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await fetch('http://ollama:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:3b',
          prompt,
          stream: false,
          format: 'json'
        })
      });

      const data = await response.json();
      return data.response;
    } catch (error) {
      this.logger.error('LLM call failed:', error);
      throw error;
    }
  }

  private renderTemplate(template: string, data: Record<string, any>): string {
    const compiled = Handlebars.compile(template);
    return compiled(data);
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
    Handlebars.registerHelper('camelCase', (str) => {
      return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
    });
    Handlebars.registerHelper('pascalCase', (str) => {
      const camel = str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
      return camel.charAt(0).toUpperCase() + camel.slice(1);
    });
  }

  private inferTechStack(partial?: Partial<TechStack>): TechStack {
    return {
      frontend: partial?.frontend || {
        framework: 'react',
        language: 'typescript',
        uiLibrary: 'shadcn'
      },
      backend: partial?.backend || {
        framework: 'express',
        language: 'typescript',
        authentication: 'jwt'
      },
      database: partial?.database || {
        type: 'postgresql',
        orm: 'prisma'
      },
      styling: partial?.styling || {
        framework: 'tailwind',
        theme: 'both'
      },
      stateManagement: partial?.stateManagement || {
        solution: 'zustand'
      },
      deployment: partial?.deployment || {
        platform: 'vercel',
        ci: true
      }
    };
  }

  private inferDesignPreferences(partial?: Partial<DesignPreferences>): DesignPreferences {
    return {
      style: partial?.style || 'modern',
      primaryColor: partial?.primaryColor || '#3b82f6',
      secondaryColor: partial?.secondaryColor || '#10b981',
      fontFamily: partial?.fontFamily || 'Inter',
      layout: partial?.layout || 'sidebar',
      responsive: partial?.responsive ?? true,
      animations: partial?.animations ?? true,
      darkMode: partial?.darkMode ?? true
    };
  }

  private getDefaultBuildConfig(partial?: Partial<BuildConfig>): BuildConfig {
    return {
      includeTests: partial?.includeTests ?? true,
      includeDocs: partial?.includeDocs ?? true,
      includeDocker: partial?.includeDocker ?? false,
      includeCI: partial?.includeCI ?? true,
      includeStorybook: partial?.includeStorybook ?? false,
      includeESLint: partial?.includeESLint ?? true,
      includePrettier: partial?.includePrettier ?? true,
      includeHusky: partial?.includeHusky ?? false
    };
  }

  private getDefaultRequirements(): ParsedRequirements {
    return {
      appType: AppType.WEB_APP,
      features: [],
      techStack: {},
      design: {},
      entities: [],
      pages: []
    };
  }

  private getProjectStructure(type: AppType, techStack: TechStack): FileNode[] {
    return [
      { name: 'src', type: 'directory', path: 'src', children: [
        { name: 'app', type: 'directory', path: 'src/app', children: [] },
        { name: 'components', type: 'directory', path: 'src/components', children: [
          { name: 'ui', type: 'directory', path: 'src/components/ui', children: [] }
        ]},
        { name: 'lib', type: 'directory', path: 'src/lib', children: [] },
        { name: 'hooks', type: 'directory', path: 'src/hooks', children: [] },
        { name: 'types', type: 'directory', path: 'src/types', children: [] },
        { name: 'utils', type: 'directory', path: 'src/utils', children: [] }
      ]},
      { name: 'public', type: 'directory', path: 'public', children: [] },
      { name: 'tests', type: 'directory', path: 'tests', children: [] },
      { name: 'docs', type: 'directory', path: 'docs', children: [] }
    ];
  }

  private generatePackageJson(request: AppBuildRequest): Record<string, any> {
    const { name, techStack } = request;

    return {
      name: name.toLowerCase().replace(/\s+/g, '-'),
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        test: 'jest',
        'test:watch': 'jest --watch'
      },
      dependencies: {
        next: '^14.0.0',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        typescript: '^5.3.0',
        '@types/node': '^20.0.0',
        '@types/react': '^18.2.0',
        tailwindcss: '^3.3.0',
        autoprefixer: '^10.4.0',
        postcss: '^8.4.0',
        zustand: '^4.4.0',
        axios: '^1.6.0',
        'react-query': '^3.39.0',
        'react-hook-form': '^7.48.0',
        zod: '^3.22.0',
        '@hookform/resolvers': '^3.3.0',
        'lucide-react': '^0.294.0',
        'class-variance-authority': '^0.7.0',
        clsx: '^2.0.0',
        'tailwind-merge': '^2.0.0'
      },
      devDependencies: {
        '@types/jest': '^29.5.0',
        jest: '^29.7.0',
        'ts-jest': '^29.1.0',
        eslint: '^8.54.0',
        'eslint-config-next': '^14.0.0',
        prettier: '^3.1.0'
      }
    };
  }

  private getTsConfig(): Record<string, any> {
    return {
      compilerOptions: {
        target: 'ES2020',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./src/*'] }
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules']
    };
  }

  private getESLintConfig(): Record<string, any> {
    return {
      extends: ['next/core-web-vitals', 'prettier'],
      rules: {
        'no-unused-vars': 'warn',
        'no-console': 'warn'
      }
    };
  }

  private getPrettierConfig(): Record<string, any> {
    return {
      semi: true,
      trailingComma: 'es5',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2
    };
  }

  private generateEnvExample(request: AppBuildRequest): string {
    return `
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/${request.name}"

# Authentication
JWT_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# API
API_URL="http://localhost:3000/api"

# Features
ENABLE_ANALYTICS=false
ENABLE_NOTIFICATIONS=false
`.trim();
  }

  private generateEntityDefinition(feature: FeatureRequest): string {
    const fields = feature.config?.fields || [];
    const fieldDefinitions = fields.map((f: any) =>
      `  ${f.name} ${f.type}${f.required ? '' : '?'}${f.default ? ` @default(${f.default})` : ''}`
    ).join('\n');

    return `model ${feature.name} {
  id        String   @id @default(cuid())
${fieldDefinitions}
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`;
  }

  private async updateBuildStatus(
    requestId: string,
    status: BuildStatus,
    outputPath?: string,
    error?: Error
  ): Promise<void> {
    const data = await this.redis.get(`build:${requestId}`);
    if (data) {
      const request = JSON.parse(data);
      request.status = status;
      request.updatedAt = new Date();
      if (outputPath) request.outputPath = outputPath;
      if (error) request.error = error.message;
      if (status === BuildStatus.COMPLETED) request.completedAt = new Date();

      await this.redis.setex(`build:${requestId}`, 86400, JSON.stringify(request));
    }
  }

  private async updateStepStatus(
    requestId: string,
    stepId: string,
    status: StepStatus,
    error?: Error
  ): Promise<void> {
    // Store step status in Redis
    await this.redis.setex(
      `build:${requestId}:step:${stepId}`,
      86400,
      JSON.stringify({ status, error: error?.message, updatedAt: new Date() })
    );
  }

  private async countLines(directory: string): Promise<number> {
    let totalLines = 0;
    const files = await fs.readdir(directory, { recursive: true });

    for (const file of files) {
      const filePath = path.join(directory, file as string);
      const stat = await fs.stat(filePath);

      if (stat.isFile() && (file as string).match(/\.(ts|tsx|js|jsx|json|css|scss)$/)) {
        const content = await fs.readFile(filePath, 'utf-8');
        totalLines += content.split('\n').length;
      }
    }

    return totalLines;
  }

  private extractDependencies(steps: BuildStep[]): string[] {
    const deps: string[] = [];
    for (const step of steps) {
      deps.push(...step.dependencies);
    }
    return [...new Set(deps)];
  }

  private async generateFileStructure(request: AppBuildRequest): Promise<FileNode[]> {
    return this.getProjectStructure(request.type, request.techStack);
  }

  private async createFileNode(node: FileNode, basePath: string): Promise<void> {
    const fullPath = path.join(basePath, node.path);

    if (node.type === 'directory') {
      await fs.ensureDir(fullPath);
      if (node.children) {
        for (const child of node.children) {
          await this.createFileNode(child, basePath);
        }
      }
    } else {
      await fs.ensureDir(path.dirname(fullPath));
      if (node.content) {
        await fs.writeFile(fullPath, node.content);
      }
    }
  }

  // Public API methods

  async getBuildStatus(requestId: string): Promise<AppBuildRequest | null> {
    const data = await this.redis.get(`build:${requestId}`);
    return data ? JSON.parse(data) : null;
  }

  async getBuildResult(requestId: string): Promise<BuildResult | null> {
    const data = await this.redis.get(`build:${requestId}:result`);
    return data ? JSON.parse(data) : null;
  }

  async downloadBuild(requestId: string): Promise<string | null> {
    const archivePath = path.join(this.outputDir, `${requestId}.zip`);
    if (await fs.pathExists(archivePath)) {
      return archivePath;
    }
    return null;
  }
}
