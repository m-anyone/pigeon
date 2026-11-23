FROM scratch

ARG TARGETARCH

COPY --chmod=0555 docker-context/linux-${TARGETARCH}/pigeon /usr/local/bin/pigeon
# Copy the directory itself so /data gets mode 0700.
COPY --chmod=0700 docker-context/rootfs/ /

WORKDIR /data
VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/pigeon"]
