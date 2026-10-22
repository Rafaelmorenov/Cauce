output "bucket_name" {
  value = aws_s3_bucket.files.id
}

output "queue_urls" {
  value = { for name, queue in aws_sqs_queue.jobs : name => queue.url }
}

output "database_secret_arn" {
  value = aws_secretsmanager_secret.database.arn
}

output "ecs_cluster_arn" {
  value = aws_ecs_cluster.main.arn
}
