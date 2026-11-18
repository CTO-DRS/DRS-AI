{{/*
Common labels
*/}}
{{- define "drs-ai.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "drs-ai.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Image reference: registry/repository:tag
*/}}
{{- define "drs-ai.image" -}}
{{- $registry := .registry | default .Values.global.imageRegistry -}}
{{- if $registry }}{{ $registry }}/{{ .repository }}:{{ .tag | default .Values.global.imageTag }}{{- else }}{{ .repository }}:{{ .tag | default .Values.global.imageTag }}{{- end -}}
{{- end -}}

{{/*
Render a Deployment + Service for a single DRS AI microservice.
Context: { name, port, replicas, image, env, resources, gpu }
*/}}
{{- define "drs-ai.microservice" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
  labels:
    {{- include "drs-ai.labels" .root | nindent 4 }}
    app.kubernetes.io/component: {{ .name }}
spec:
  replicas: {{ .replicas | default 1 }}
  selector:
    matchLabels:
      {{- include "drs-ai.selectorLabels" .root | nindent 6 }}
      app.kubernetes.io/component: {{ .name }}
  template:
    metadata:
      labels:
        {{- include "drs-ai.selectorLabels" .root | nindent 8 }}
        app.kubernetes.io/component: {{ .name }}
    spec:
      {{- with .root.Values.global.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .root.Values.global.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .root.Values.global.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .name }}
          image: {{ include "drs-ai.image" (dict "registry" .root.Values.global.imageRegistry "repository" (printf "drs-ai/%s" .name) "tag" .root.Values.global.imageTag "Values" .root.Values) }}
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: {{ .port }}
              protocol: TCP
          env:
            - name: NODE_ENV
              value: {{ .root.Values.global.environment | quote }}
            - name: PORT
              value: {{ .port | quote }}
            - name: REDIS_HOST
              value: {{ if .root.Values.redis.enabled }}redis{{ else }}"{{ .root.Values.redis.externalHost | default "" }}"{{ end }}
            - name: REDIS_PORT
              value: "6379"
            - name: POSTGRES_HOST
              value: {{ if .root.Values.postgres.enabled }}postgres{{ else }}"{{ .root.Values.postgres.externalHost | default "" }}"{{ end }}
            - name: POSTGRES_PORT
              value: "5432"
            - name: POSTGRES_DB
              value: {{ .root.Values.postgres.database | quote }}
            - name: POSTGRES_USER
              value: {{ .root.Values.postgres.user | quote }}
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: drs-ai-secrets
                  key: postgresPassword
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: drs-ai-secrets
                  key: jwtSecret
            {{- if .gpu }}
            - name: NVIDIA_VISIBLE_DEVICES
              value: all
            {{- end }}
            {{- with .env }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
          {{- if .resources }}
          resources:
            {{- toYaml .resources | nindent 12 }}
          {{- else }}
          resources:
            {{- toYaml .root.Values.defaultResources | nindent 12 }}
          {{- end }}
          {{- if .gpu }}
          {{- with .root.Values.ollama.gpu }}
          volumeMounts:
            - name: dshm
              mountPath: /dev/shm
          {{- end }}
          {{- end }}
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
      {{- if .gpu }}
      volumes:
        - name: dshm
          emptyDir:
            medium: Memory
            sizeLimit: 1Gi
      {{- end }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ .name }}
  labels:
    {{- include "drs-ai.labels" .root | nindent 4 }}
    app.kubernetes.io/component: {{ .name }}
spec:
  type: ClusterIP
  ports:
    - port: {{ .port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "drs-ai.selectorLabels" .root | nindent 4 }}
    app.kubernetes.io/component: {{ .name }}
{{- end -}}
