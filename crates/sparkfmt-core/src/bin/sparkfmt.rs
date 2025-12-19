use sparkfmt_core::format_sql;
use std::env;
use std::fs;
use std::io::{self, Read};
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        eprintln!("Usage: {} <input.sql> [output.sql]", args[0]);
        eprintln!();
        eprintln!("Examples:");
        eprintln!("  {} query.sql                    # Format and print to stdout", args[0]);
        eprintln!("  {} query.sql formatted.sql      # Format and save to file", args[0]);
        eprintln!("  {} - < query.sql                # Read from stdin", args[0]);
        process::exit(1);
    }
    
    let input_path = &args[1];
    let output_path = if args.len() > 2 {
        Some(&args[2])
    } else {
        None
    };
    
    // Read input
    let input_sql = if input_path == "-" {
        // Read from stdin
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)
            .unwrap_or_else(|err| {
                eprintln!("Error reading from stdin: {}", err);
                process::exit(1);
            });
        buffer
    } else {
        // Read from file
        fs::read_to_string(input_path)
            .unwrap_or_else(|err| {
                eprintln!("Error reading file '{}': {}", input_path, err);
                process::exit(1);
            })
    };
    
    // Format SQL
    let formatted = match format_sql(&input_sql) {
        Ok(result) => result,
        Err(err) => {
            eprintln!("Error formatting SQL: {}", err);
            eprintln!("Returning original input unchanged.");
            input_sql
        }
    };
    
    // Write output
    if let Some(output_file) = output_path {
        fs::write(output_file, &formatted)
            .unwrap_or_else(|err| {
                eprintln!("Error writing to file '{}': {}", output_file, err);
                process::exit(1);
            });
        eprintln!("Formatted SQL written to: {}", output_file);
    } else {
        // Print to stdout
        println!("{}", formatted);
    }
}
