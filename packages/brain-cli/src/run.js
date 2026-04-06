import {
  compileCommand,
  decisionNewCommand,
  doctorCommand,
  healthCheckCommand,
  ingestCommand,
  initCommand,
  promoteCommand,
  queryCommand
} from "../../brain-core/src/index.js";

function getFlagValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function removeFlags(args, names) {
  const output = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (names.includes(value)) {
      index += 1;
      continue;
    }

    output.push(value);
  }

  return output;
}

function formatIssues(result) {
  if (!result.issues || result.issues.length === 0) {
    return "No issues found.";
  }

  return result.issues
    .map((issue) => `- [${issue.severity}] ${issue.path}: ${issue.message}`)
    .join("\n");
}

function formatQuery(result) {
  return [
    result.answer,
    "",
    `Confidence: ${result.confidence}`,
    "Provenance:",
    ...(result.provenance.length > 0 ? result.provenance.map((item) => `- ${item}`) : ["- none"])
  ].join("\n");
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const cwd = options.cwd ?? process.cwd();

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    return {
      exitCode: 0,
      stdout: `Usage:
  brain init <path> --profile research|creator|operator
  brain doctor
  brain ingest <file-or-folder-or-url>
  brain compile [scope]
  brain query "<question>"
  brain health-check
  brain promote <candidate-id>
  brain decision new [question]
`
    };
  }

  const [command, ...rest] = argv;
  const vault = getFlagValue(rest, "--vault");
  const args = removeFlags(rest, ["--vault", "--profile"]);

  try {
    switch (command) {
      case "init": {
        const targetPath = args[0];
        const profile = getFlagValue(rest, "--profile") ?? "research";
        const result = initCommand({ targetPath, profile, cwd });
        return { exitCode: 0, stdout: result.message };
      }

      case "doctor": {
        const result = doctorCommand({ cwd, vault });
        return {
          exitCode: result.status === "error" ? 1 : 0,
          stdout: `${result.message}\n${formatIssues(result)}`
        };
      }

      case "ingest": {
        const result = ingestCommand({ target: args[0], cwd, vault });
        return {
          exitCode: 0,
          stdout: `${result.message}\n${result.written.map((item) => `- ${item}`).join("\n")}`
        };
      }

      case "compile": {
        const result = compileCommand({ scope: args[0], cwd, vault });
        return { exitCode: 0, stdout: result.message };
      }

      case "query": {
        const result = queryCommand({ question: args.join(" "), cwd, vault });
        return { exitCode: 0, stdout: formatQuery(result) };
      }

      case "health-check": {
        const result = healthCheckCommand({ cwd, vault });
        return {
          exitCode: result.status === "error" ? 1 : 0,
          stdout: `${result.message}\n${formatIssues(result)}`
        };
      }

      case "promote": {
        const result = promoteCommand({ candidateId: args[0], cwd, vault });
        return { exitCode: 0, stdout: result.message };
      }

      case "decision": {
        if (args[0] !== "new") {
          throw new Error("Only `brain decision new` is supported in V1.");
        }

        const result = decisionNewCommand({ question: args.slice(1).join(" ") || undefined, cwd, vault });
        return { exitCode: 0, stdout: result.message };
      }

      default:
        return { exitCode: 1, stderr: `Unknown command: ${command}` };
    }
  } catch (error) {
    return {
      exitCode: 1,
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}
