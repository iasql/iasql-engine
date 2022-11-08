const { PrismaClient } = require('@prisma/client');

const pkg = require('./package.json');

const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GH_PAT, GITHUB_REF, REPO_URI } = process.env;
const PORT = 8088;

// TODO replace with your desired project name
const APP_NAME = pkg.name;

const prisma = new PrismaClient();

async function main() {
  const data = {
    app_name: APP_NAME,
    public_ip: true,
    app_port: PORT,
    image_tag: 'latest',
  };
  await prisma.ecs_simplified.upsert({
    where: { app_name: APP_NAME },
    create: data,
    update: data,
  });

  const apply = await prisma.$queryRaw`SELECT *
                                       from iasql_apply();`;
  console.dir(apply);

  console.log('Using ecr_build to build the docker image and push it to ECR...');
  const repoId = (await prisma.repository.findFirst({
    where: { repository_name: `${APP_NAME}-repository` },
    select: { id: true },
  })).id.toString();
  let repoUri;
  if (REPO_URI) // manual
    repoUri = REPO_URI;
  else if (GITHUB_SERVER_URL && GITHUB_REPOSITORY) // CI
    repoUri = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`;
  else
    repoUri = 'https://github.com/iasql/iasql-engine'
  const image = await prisma.$queryRaw`SELECT ecr_build(
              ${repoUri},
              ${repoId},
              './examples/ecs-fargate/prisma/app',
              ${GH_PAT},
              ${GITHUB_REF}
  );`;
  console.log(image);
}

main()
  .catch(e => {
    console.log(e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
