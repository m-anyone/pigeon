FROM scratch

ARG TARGETARCH

COPY --chmod=0555 docker-context/linux-${TARGETARCH}/pigeon /usr/local/bin/pigeon
# Copy the root filesystem tree so the data directory itself is owned by Pigeon.
COPY --chown=65532:65532 --chmod=0700 docker-context/rootfs/ /

USER 65532:65532
WORKDIR /data
VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/pigeon"]
