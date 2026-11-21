// Pipeline DevSecOps do AgroSmart no Jenkins (o mesmo do .github/workflows/devsecops.yml).
// Laboratório: devsecops/docker-compose.yml sobe o Jenkins e o SonarQube, como no capítulo 10.
// O agente precisa de Docker, Bun, Node.js 22.9+ e Python 3.10+.
// No Jenkins: servidor SonarQube cadastrado com o nome "sonarqube" e a ferramenta "sonar-scanner".
pipeline {
  agent any

  environment {
    TRIVY_IMAGE = 'aquasec/trivy:0.62.1'
    DB_PATH = "${WORKSPACE}/data/agrosmart.db"
    MQTT_URL = 'mqtt://localhost:1883'
  }

  options {
    timestamps()
    timeout(time: 40, unit: 'MINUTES')
  }

  stages {
    stage('1. Build e testes do app web') {
      steps {
        dir('web') {
          sh 'bun install --frozen-lockfile'
          sh 'bun run lint'
          sh './node_modules/.bin/tsc --noEmit'
          sh 'bun run test:telemetry'
          sh 'bun run build'
        }
      }
    }

    stage('2. Testes do Python') {
      steps {
        sh '''
          python3 -m venv .venv-ci
          . .venv-ci/bin/activate
          pip install -q -r simulator/requirements.txt -r api/requirements.txt pytest httpx
          cd simulator && python -m pytest -q
        '''
      }
    }

    stage('3. Qualidade do código (SonarQube)') {
      steps {
        script {
          def scanner = tool 'sonar-scanner'
          withSonarQubeEnv('sonarqube') {
            sh "${scanner}/bin/sonar-scanner"
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: false
        }
      }
    }

    stage('4. Imagens Docker e vulnerabilidades (Trivy)') {
      steps {
        sh '''
          docker compose -f docker-compose.yml build web api
          mkdir -p relatorios
          TRIVY="docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v $WORKSPACE:/src -w /src $TRIVY_IMAGE"
          $TRIVY image --scanners vuln --format json --output relatorios/trivy-imagem-web.json agrosmart-web:local
          $TRIVY image --scanners vuln --format json --output relatorios/trivy-imagem-api.json agrosmart-api:local
          $TRIVY config --format json --output relatorios/trivy-config.json .
          python3 devsecops/trivy_resumo.py --bloquear CRITICAL relatorios/trivy-*.json
        '''
      }
    }

    stage('5. Execução ponta a ponta') {
      steps {
        sh '''
          docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mosquitto
          mkdir -p data/logs
          cd web && bun run db:migrate && bun run seed
          nohup ./node_modules/.bin/tsx scripts/worker.ts > ../data/logs/worker.log 2>&1 &
          sleep 10
          cd ..
          . .venv-ci/bin/activate
          python simulator/simulator.py --backfill-hours 24 --count 48 --speed 900 --scenario misto --seed 2026
          sleep 30
          python3 devsecops/execucao_resumo.py data/agrosmart.db --min-leituras 100 --min-decisoes 10
        '''
      }
    }
  }

  post {
    always {
      sh 'docker compose -f docker-compose.yml -f docker-compose.dev.yml down || true'
      archiveArtifacts artifacts: 'relatorios/**, data/logs/**', allowEmptyArchive: true
    }
  }
}
