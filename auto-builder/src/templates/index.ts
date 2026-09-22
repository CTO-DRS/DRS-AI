export const templates = {
  components: {
    layout: `import React from 'react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, className }) => {
  return (
    <div className={cn('min-h-screen bg-background', className)}>
      {{#if (eq layout "sidebar")}}
      <div className="flex">
        <aside className="w-64 min-h-screen bg-card border-r">
          {/* Sidebar content */}
        </aside>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
      {{else}}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
      {{/if}}
    </div>
  );
};`,

    button: `import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          {
            'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'primary',
            'bg-secondary text-secondary-foreground hover:bg-secondary/90': variant === 'secondary',
            'border border-input bg-background hover:bg-accent': variant === 'outline',
            'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 py-2': size === 'md',
            'h-12 px-6 text-lg': size === 'lg',
          },
          className
        )}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && (
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';`,

    input: `import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
          'text-sm ring-offset-background file:border-0 file:bg-transparent',
          'file:text-sm file:font-medium placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';`,

    card: `import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';`,

    modal: `import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn('relative bg-background rounded-lg shadow-lg max-w-lg w-full mx-4', className)}>
        {title && (
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="p-1 hover:bg-accent rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};`,

    table: `import React from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  )
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
  )
);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-12 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...props} />
  )
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('p-4 align-middle', className)} {...props} />
  )
);
TableCell.displayName = 'TableCell';`,

    form: `import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';

interface FormProps<T extends z.ZodType> {
  schema: T;
  onSubmit: (data: z.infer<T>) => void;
  children: React.ReactNode;
  className?: string;
}

export function Form<T extends z.ZodType>({ schema, onSubmit, children, className }: FormProps<T>) {
  const form = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className={cn('space-y-4', className)}>
      {children}
    </form>
  );
}

export const FormField = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props} />
  )
);
FormField.displayName = 'FormField';

export const FormLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props} />
  )
);
FormLabel.displayName = 'FormLabel';

export const FormError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-destructive', className)} {...props} />
  )
);
FormError.displayName = 'FormError';`
  },

  pages: {
    home: `import React from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{{appName}}</h1>
            <p className="text-muted-foreground mt-2">{{description}}</p>
          </div>
          <Button>Get Started</Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature 1</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Description of your first feature.</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Feature 2</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Description of your second feature.</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Feature 3</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Description of your third feature.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}`,

    auth: `import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const authSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function AuthPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
  });

  const onSubmit = (data: AuthFormData) => {
    console.log(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input {...register('email')} type="email" placeholder="you@example.com" />
              {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
            </div>
            
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input {...register('password')} type="password" placeholder="••••••••" />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
            </div>
            
            <Button type="submit" className="w-full">Sign In</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}`,

    dashboard: `import React from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';

export default function DashboardPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-3xl font-bold">1,234</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Revenue</p>
              <p className="text-3xl font-bold">$12,345</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Orders</p>
              <p className="text-3xl font-bold">567</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Growth</p>
              <p className="text-3xl font-bold text-green-500">+23%</p>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>John Doe</TableCell>
                  <TableCell>Created account</TableCell>
                  <TableCell>2024-01-01</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}`
  },

  api: {
    auth: `import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export async function POST(req: NextRequest) {
  try {
    const { action, email, password } = await req.json();

    switch (action) {
      case 'login':
        return handleLogin(email, password);
      case 'register':
        return handleRegister(email, password);
      case 'logout':
        return handleLogout();
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleLogin(email: string, password: string) {
  // TODO: Implement actual user lookup
  const user = { id: '1', email, password: await bcrypt.hash('password', 10) };

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' });

  return NextResponse.json({ token, user: { id: user.id, email } });
}

async function handleRegister(email: string, password: string) {
  // TODO: Implement actual user creation
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: '1', email };

  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' });

  return NextResponse.json({ token, user });
}

function handleLogout() {
  return NextResponse.json({ message: 'Logged out successfully' });
}`,

    crud: `import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';

    const items = await prisma.{{entity}}.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.{{entity}}.count({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
    });

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    const item = await prisma.{{entity}}.create({
      data,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...data } = await req.json();
    
    const item = await prisma.{{entity}}.update({
      where: { id },
      data,
    });

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    
    await prisma.{{entity}}.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Item deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}`
  },

  database: {
    schema: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

{{entities}}`
  },

  docker: {
    file: `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]`,

    compose: `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/app
      - JWT_SECRET=your-secret-key
      - NODE_ENV=production
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=app
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:`
  },

  ci: {
    github: `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build`
  }
};
