# Flask API with Autocomplete

This is a Flask API that provides autocomplete suggestions for SQL queries using FAISS for fast similarity search.

## Setup

### Environment Variables

Before running the Flask server, you'll need to set the following environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `PROMPTLAYER_API_KEY`: Your PromptLayer API key

### Docker

You can run the Flask server using Docker. Here are the steps:

1. Install Docker on your machine.
2. Clone the repository.
3. Navigate to the project directory and run makefile: make install
4. The Flask server should now be running on `http://localhost:5000`.

### Docker Compose

Alternatively, you can use Docker Compose to run the Flask server along with a PostgreSQL database. Here are the steps:

1. Install Docker Compose on your machine.
2. Clone the repository.
3. Navigate to the project directory and run: docker-compose up
4. The Flask server should now be running on `http://localhost:5000`.

## Usage

The API has two endpoints:

### `/discover`

This endpoint takes a connection string as a POST parameter and returns a 200 status code if the connection was successful. The connection string should be in the format specified by SQLAlchemy. Once the connection is established, the API will generate a vector index of the tables in the database using OpenAI's GPT-3 language model and FAISS for fast similarity search.

Example usage: curl --request POST --url http://localhost:5000/discover --header 'content-type: multipart/form-data' --form conn_str=postgresql://user:password@localhost/mydatabase

### `/autocomplete`

This endpoint takes an started SQL query as a POST parameter and returns a suggestion with the SQL query completed.

Example usage: curl --request POST --url http://localhost:5000/autocomplete --header 'content-type: multipart/form-data' --form query='SELECT id'

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
