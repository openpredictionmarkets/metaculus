name: Deploy to PRODUCTION

on:
  workflow_dispatch:

jobs:
  deploy-to-prod:
    runs-on: ubuntu-latest
    env:
      HEROKU_API_KEY: ${{ secrets.HEROKU_API_KEY }}
      HEROKU_APP: dev-metaculus-web
      NEXT_PUBLIC_APP_URL: "https://beta.metaculus.com"
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: ${{ secrets.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Build and deploy to Heroku
        run: |
          heroku container:login # uses the HEROKU_API_KEY
          ./scripts/deploy_to_heroku.sh
